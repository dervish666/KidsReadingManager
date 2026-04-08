# Organization Hard Delete (Data Retention Purge)

**Date:** 2026-04-08
**Status:** Draft
**Author:** Claude + Sam

## Problem

When a school cancels its subscription, data is soft-deleted (`is_active = 0`) and the nightly cron hard-deletes the `organizations` row after 90 days. But the cron only deletes the org row itself — it does not cascade through the 26 org-scoped child tables. This leaves orphaned student records, reading sessions, user accounts, and other personal data in the database indefinitely, violating the retention policy (GDPR-05) and the storage limitation principle (Article 5(1)(e)).

Additionally, there is no API endpoint for immediate on-demand data purging to fulfil Article 17 (right to erasure) requests from school controllers.

## Design

### Shared function: `hardDeleteOrganization(db, orgId)`

New file: `src/services/orgPurge.js`.

**Behaviour:**

1. Loads the org row. Throws 404 if not found.
2. Checks `legal_hold`. Throws 409 if `legal_hold = 1`.
3. Checks `purged_at`. Throws 409 if already purged.
4. Logs the purge action to `data_rights_log` (request_type: `erasure`, matching the schema's documented enum; before any deletes).
5. Deletes all org-scoped data across 26 tables in FK-safe order (children before parents). Each DELETE is a single statement with a WHERE clause scoped by `organization_id` or a subquery on a parent table. Tables without direct `organization_id` use subqueries (e.g. `reading_sessions` via `student_id IN (SELECT id FROM students WHERE organization_id = ?)`). Each DELETE runs individually (not via `db.batch()`) so that per-table try/catch works — one table failing does not abort the rest. This means 26 sequential round-trips to D1, which is acceptable for a rare destructive operation.
6. Deletes old `data_rights_log` entries for the org, excluding the purge entry just created: `WHERE organization_id = ? AND id != ?` (passing the ID from step 4).
7. Anonymises the `organizations` row: sets `name = 'Deleted Organisation'`, nulls `contact_email`, `billing_email`, `phone`, `address_line_1`, `address_line_2`, `town`, `postcode`, `wonde_school_id`, `wonde_school_token`, `mylogin_org_id`, `stripe_customer_id`, `stripe_subscription_id`, `consent_given_by`. Sets `purged_at = datetime('now')`, `updated_at = datetime('now')`.
8. Returns a summary object: `{ orgId, tablesProcessed: number, errors: string[] }`.

**Error handling:** Each table delete is wrapped in a try/catch. Failures on individual tables are logged and collected in the `errors` array but do not abort the overall purge. This matches the demoReset resilience pattern — a missing table or FK issue on one table should not leave the rest un-purged.

**Note on existing individual hard-delete cron:** The nightly cron already hard-deletes individually soft-deleted students and users after 90 days. By the time the org-level purge runs, some rows may already be gone. This is expected and harmless — deleting 0 rows from a table is a no-op.

### FK-safe delete order

Children before parents. Subqueries used where a table lacks a direct `organization_id` column.

```
 1. support_ticket_notes   (ticket_id IN SELECT id FROM support_tickets WHERE organization_id = ?)
 2. support_tickets         (organization_id = ?)
 3. student_badges          (organization_id = ?)
 4. student_reading_stats   (organization_id = ?)
 5. reading_sessions        (student_id IN SELECT id FROM students WHERE organization_id = ?)
 6. student_preferences     (student_id IN SELECT id FROM students WHERE organization_id = ?)
 7. class_assignments       (class_id IN SELECT id FROM classes WHERE organization_id = ?)
 8. students                (organization_id = ?)
 9. classes                 (organization_id = ?)
10. org_book_selections     (organization_id = ?)
11. org_settings            (organization_id = ?)
12. org_ai_config           (organization_id = ?)
13. term_dates              (organization_id = ?)
14. billing_events          (organization_id = ?)
15. metadata_jobs           (organization_id = ?)
16. wonde_sync_log          (organization_id = ?)
17. wonde_employee_classes  (organization_id = ?)
18. wonde_erased_students   (organization_id = ?)
19. data_rights_log         (organization_id = ? AND id != <purge_log_id>)
20. refresh_tokens          (user_id IN SELECT id FROM users WHERE organization_id = ?)
21. password_reset_tokens   (user_id IN SELECT id FROM users WHERE organization_id = ?)
22. user_tour_completions   (user_id IN SELECT id FROM users WHERE organization_id = ?)
23. login_attempts          (email IN SELECT email FROM users WHERE organization_id = ?)
24. rate_limits             (key IN SELECT id FROM users WHERE organization_id = ?)
25. audit_log               (organization_id = ?)
26. users                   (organization_id = ?)
```

The `organizations` row is then anonymised (not deleted).

**Assumptions:**
- `class_assignments` are always org-internal (a class and its assigned users belong to the same org). Cross-org assignments do not exist in practice.
- `metadata_config` and `book_metadata_log` are global tables (no `organization_id` column) and are not touched by org purge.
- `oauth_state`, `email_signups`, `books`, `books_fts`, `book_genres`, and `genres` are global tables and are not touched.

**Note on active-data safety check:** The existing cron checks for active students/users before deleting an org row. The new implementation deliberately removes this check — the purpose of the purge is to cascade-delete everything. The 90-day window after deactivation (during which no automated purge runs) is the sole safeguard. Manual purge via the API endpoint requires explicit org-name confirmation.

### API endpoint

`DELETE /api/organization/:id/purge`

- **Auth:** `requireOwner()`
- **Audit:** `auditLog('purge', 'organization')`
- **Body:** `{ "confirm": "<org name>" }` — case-insensitive trimmed comparison against the org's current `name`. Returns 400 if mismatch.
- **Guards:**
  - 404 if org not found
  - 409 if `legal_hold = 1` (message: "Organisation is under legal hold and cannot be purged")
  - 409 if `purged_at` is set (message: "Organisation has already been purged")
  - 400 if `confirm` doesn't match org name
- **Response:** 200 with the summary from `hardDeleteOrganization`.
- **Can purge active or inactive orgs** — Article 17 requests don't require prior deactivation.

### Cron update

The existing org hard-delete block in `src/worker.js` (lines 569-600) is replaced:

1. Query: `SELECT id FROM organizations WHERE is_active = 0 AND updated_at < datetime('now', '-90 days') AND legal_hold = 0 AND purged_at IS NULL`
2. For each org: call `hardDeleteOrganization(db, orgId)`
3. Log summary per org

This replaces the current logic that checks for active students/users and only deletes the org row.

### Migration

New migration adding two columns to `organizations`:

```sql
ALTER TABLE organizations ADD COLUMN purged_at TEXT;
ALTER TABLE organizations ADD COLUMN legal_hold INTEGER NOT NULL DEFAULT 0;
```

### Public paths

No changes needed. The endpoint is behind JWT auth + owner role guard. Not a public path.

### Testing

- **Unit test:** `hardDeleteOrganization` with a mock DB verifying all 26 DELETE statements are issued in order, the org row is anonymised, and the data_rights_log entry is created.
- **Unit test:** Purge endpoint returns 400 on name mismatch, 409 on legal hold, 409 on already purged, 200 on success.
- **Unit test:** Legal hold prevents both API and cron purge.
- **Integration consideration:** The cron path is already tested implicitly by the existing retention tests. The new behaviour is that it now cascades properly.

### Files changed

| File | Change |
|---|---|
| `src/services/orgPurge.js` | New — `hardDeleteOrganization(db, orgId)` |
| `src/routes/organization.js` | New endpoint `DELETE /:id/purge` |
| `src/worker.js` | Replace naive org delete with `hardDeleteOrganization` call |
| `migrations/XXXX_org_purge_columns.sql` | Add `purged_at`, `legal_hold` columns |
| `src/__tests__/unit/orgPurge.test.js` | New — unit tests |

### CLAUDE.md updates

- Add `src/services/orgPurge.js` to file map
- Add purge endpoint to `src/routes/organization.js` description
- Note `legal_hold` and `purged_at` columns in Key Tables section

### Out of scope

- Bulk data export endpoint (separate work item, already available via DataManagement UI)
- Retention monitoring dashboard (lower priority)
- UI for setting/clearing legal hold (can be done via direct API or DB for now)
- Notification to school controller on automated purge (could be added later)
