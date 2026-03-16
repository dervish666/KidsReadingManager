# Comprehensive Database Audit Report

**Date**: 2026-03-16
**Scope**: All 34 migration files, d1Provider.js, all route files with SQL, cron jobs, sync services
**Database**: Cloudflare D1 (SQLite-based)
**Scale context**: 10+ schools, 18,000+ books, thousands of students

---

## CRITICAL Findings

### C1. Tenant Isolation Breach: classes/:id/students Missing organization_id Filter

- **Category**: Data Integrity / Security
- **Severity**: CRITICAL
- **File**: `src/routes/classes.js` line 116
- **SQL**:
  ```sql
  SELECT * FROM students WHERE class_id = ? AND is_active = 1 ORDER BY name ASC
  ```
- **Risk**: If a class_id were guessed or enumerated, a teacher in Org A could retrieve students from Org B's class. The class ownership check at line 107-113 verifies the class belongs to the org, but the student query itself does not include `organization_id`. If a bug or race condition bypasses the class check, students from any org could leak.
- **Fix**:
  ```sql
  SELECT * FROM students
  WHERE class_id = ? AND organization_id = ? AND is_active = 1
  ORDER BY name ASC
  ```
  Bind `organizationId` as the second parameter. Defense-in-depth: always scope by org even when the parent is already verified.

### C2. Tenant Isolation Breach: GET /api/organization Missing is_active Filter

- **Category**: Data Integrity
- **Severity**: CRITICAL
- **File**: `src/routes/organization.js` line 23
- **SQL**:
  ```sql
  SELECT * FROM organizations WHERE id = ?
  ```
- **Risk**: Returns deactivated (soft-deleted) organizations. The organizationId comes from JWT, so a user whose org was deactivated but whose JWT hasn't expired could still fetch org details. The tenant middleware at `tenant.js:106` fetches the org without `is_active = 1` and then checks `org.is_active` in JS, which does protect the middleware path. However, the route itself should still filter.
- **Fix**:
  ```sql
  SELECT * FROM organizations WHERE id = ? AND is_active = 1
  ```

### C3. Non-Atomic Multi-Step Operations: Session Creation + Book Update + Streak

- **Category**: Data Integrity
- **Severity**: CRITICAL
- **File**: `src/routes/students.js` lines 1001-1030
- **Issue**: Adding a reading session involves 3 separate writes:
  1. INSERT into reading_sessions
  2. UPDATE students SET current_book_id
  3. updateStudentStreak (which does a SELECT + calculateStreak + UPDATE)

  If step 2 or 3 fails, the session exists but the student's book/streak is inconsistent. D1 `db.batch()` would make steps 1-2 atomic, but step 3 requires a read before write so it cannot be included.
- **Fix**: Combine steps 1 and 2 into `db.batch()`:
  ```js
  const statements = [
    db.prepare('INSERT INTO reading_sessions ...').bind(...),
    db.prepare('UPDATE students SET current_book_id = ? ...').bind(...)
  ];
  await db.batch(statements);
  // Step 3: streak update (already fault-tolerant via cron)
  ```
  The streak is recalculated by cron anyway, so a failed inline recalc is self-healing. But the session + book update should be atomic.

### C4. SQL Injection via String Interpolation in LIMIT Clause

- **Category**: Query Performance / Security
- **Severity**: CRITICAL
- **File**: `src/routes/students.js` line 471/478
- **Code**:
  ```js
  const limitClause = limitParam ? ` LIMIT ${Math.max(1, Math.min(parseInt(limitParam, 10) || 1000, 1000))}` : '';
  // ...
  WHERE rs.student_id = ?
  ORDER BY rs.session_date DESC${limitClause}
  ```
- **Risk**: While `parseInt` + `Math.min/max` sanitizes the value numerically, string interpolation into SQL is an anti-pattern. If `parseInt` returns NaN (the fallback `|| 1000` handles this case), the value is safe, but this pattern is fragile and violates defense-in-depth.
- **Fix**: Use parameterized LIMIT:
  ```js
  const limitVal = limitParam ? Math.max(1, Math.min(parseInt(limitParam, 10) || 1000, 1000)) : 1000;
  const result = await db.prepare(`
    SELECT rs.*, b.title as book_title, b.author as book_author
    FROM reading_sessions rs
    LEFT JOIN books b ON rs.book_id = b.id
    WHERE rs.student_id = ?
    ORDER BY rs.session_date DESC
    LIMIT ?
  `).bind(id, limitVal).all();
  ```

---

## HIGH Findings

### H1. Missing Index: reading_sessions Queries by student_id Without organization_id

- **Category**: Index / Query Performance
- **Severity**: HIGH
- **File**: `src/routes/students.js` lines 254-263 (GET /api/students/sessions)
- **SQL**:
  ```sql
  SELECT rs.*, s.name as student_name, b.title as book_title, b.author as book_author
  FROM reading_sessions rs
  INNER JOIN students s ON rs.student_id = s.id
  LEFT JOIN books b ON rs.book_id = b.id
  WHERE s.organization_id = ? AND s.class_id = ? AND s.is_active = 1
    AND rs.session_date >= ? AND rs.session_date <= ?
  ```
- **Issue**: This query filters students by org+class, then joins reading_sessions. The query planner must scan reading_sessions for each matching student. With thousands of sessions per school, this is expensive. The existing `idx_sessions_student_date` covers the JOIN but there's no covering index for the date range scan across all students in a class.
- **Fix**: The current indexes are adequate for the JOIN pattern (student_id, session_date). However, consider a composite index if this query becomes slow:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_students_org_class_active
    ON students(organization_id, class_id, is_active);
  ```
  This would let the planner find matching students efficiently before joining sessions.

### H2. N+1 Query Pattern: Stats Endpoint Chunked Session Fetch

- **Category**: Query Performance
- **Severity**: HIGH
- **File**: `src/routes/students.js` lines 326-343 (GET /api/students/stats)
- **SQL**: Fetches sessions in chunks of 90 student IDs:
  ```js
  for (let i = 0; i < studentIds.length; i += BIND_LIMIT) {
    const chunk = studentIds.slice(i, i + BIND_LIMIT);
    const sessResult = await db.prepare(`
      SELECT rs.session_date, rs.location, b.title as book_title
      FROM reading_sessions rs LEFT JOIN books b ON rs.book_id = b.id
      WHERE rs.student_id IN (${placeholders})${dateFilter}
    `).bind(...binds).all();
  }
  ```
- **Issue**: For a school with 300 students, this fires 4 sequential queries. Each scans the reading_sessions table with an IN clause.
- **Fix (Medium-term)**: Add `organization_id` column to `reading_sessions` (denormalized) so stats can query sessions directly:
  ```sql
  SELECT rs.session_date, rs.location, b.title
  FROM reading_sessions rs
  LEFT JOIN books b ON rs.book_id = b.id
  WHERE rs.organization_id = ? AND rs.session_date >= ? AND rs.session_date <= ?
  ```
  This eliminates the student-first-then-sessions pattern entirely. Requires migration to add and backfill the column.

### H3. Streak Cron: 2 Queries Per Student (SELECT sessions + UPDATE student)

- **Category**: Query Performance
- **Severity**: HIGH
- **File**: `src/routes/students.js` lines 1757-1781 (recalculateAllStreaks)
- **Issue**: For each student, the cron executes:
  1. `SELECT session_date FROM reading_sessions WHERE student_id = ?` (sequential per student, 10 concurrent)
  2. `UPDATE students SET current_streak = ?, ...` (sequential per student)

  For 1000 students across 10 schools: 2000 D1 queries from the cron. D1 has a per-request limit of ~1000 subrequests for Workers; this will fail at scale.
- **Fix**: Batch the UPDATE statements. After calculating streaks for all students in an org, collect all UPDATE statements and execute in `db.batch()` chunks of 100:
  ```js
  const updateStatements = [];
  for (const student of studentList) {
    // ... calculate streak ...
    updateStatements.push(
      db.prepare('UPDATE students SET current_streak=?, longest_streak=?, streak_start_date=? WHERE id=?')
        .bind(streakData.currentStreak, streakData.longestStreak, streakData.streakStartDate, student.id)
    );
  }
  for (let i = 0; i < updateStatements.length; i += 100) {
    await db.batch(updateStatements.slice(i, i + 100));
  }
  ```
  This reduces 1000 individual UPDATEs to 10 batch calls.

### H4. Missing Index: reading_sessions.book_id + student_id for Profile Builder

- **Category**: Index
- **Severity**: HIGH
- **File**: `src/utils/studentProfile.js` lines 52-58
- **SQL**:
  ```sql
  SELECT DISTINCT rs.book_id, b.title, b.author, b.genre_ids, rs.session_date
  FROM reading_sessions rs
  LEFT JOIN books b ON rs.book_id = b.id
  WHERE rs.student_id = ? AND rs.book_id IS NOT NULL
  ORDER BY rs.session_date DESC
  ```
- **Issue**: `idx_sessions_student_date` covers (student_id, session_date) but this query also filters `book_id IS NOT NULL`. The DISTINCT + ORDER BY may cause a temp sort.
- **Fix**: The existing index is adequate for this query since student_id is the leading column and the result set is small per student. No action needed unless profiling shows otherwise.

### H5. Soft Delete Not Filtered: User Deletion Check

- **Category**: Data Integrity
- **Severity**: HIGH
- **File**: `src/routes/users.js` line 420-422
- **SQL**:
  ```sql
  SELECT * FROM users WHERE id = ? AND organization_id = ?
  ```
- **Risk**: When deleting a user, this query does NOT filter `is_active = 1`. An admin could "delete" an already-deleted user, which would succeed silently (setting is_active = 0 again). More importantly, the subsequent refresh token revocation (line 444-446) would execute against already-revoked tokens, wasting work.
- **Fix**:
  ```sql
  SELECT * FROM users WHERE id = ? AND organization_id = ? AND is_active = 1
  ```

### H6. Orphan Book Cleanup: Full Table Scan

- **Category**: Query Performance
- **Severity**: HIGH
- **File**: `src/routes/books.js` line 898
- **SQL**:
  ```sql
  DELETE FROM books WHERE id NOT IN (SELECT book_id FROM org_book_selections)
  ```
- **Issue**: `NOT IN (subquery)` on the entire books table (18,000+ rows) with a subquery scanning all org_book_selections. This is O(N*M) in the worst case.
- **Fix**: Use `NOT EXISTS` which is typically better optimized:
  ```sql
  DELETE FROM books WHERE NOT EXISTS (
    SELECT 1 FROM org_book_selections WHERE book_id = books.id
  )
  ```
  The existing `idx_book_selections_book` index on org_book_selections(book_id) makes the EXISTS check efficient.

### H7. FTS5 Join Bug: Alias Mismatch

- **Category**: Query Performance / Correctness
- **Severity**: HIGH
- **File**: `src/routes/books.js` lines 59-65, 162-168
- **SQL**:
  ```sql
  SELECT b.* FROM books b
  INNER JOIN org_book_selections obs ON b.id = obs.book_id
  INNER JOIN books_fts fts ON b.id = fts.id
  WHERE obs.organization_id = ? AND books_fts MATCH ?
  ```
- **Issue**: The FTS table is aliased as `fts` in the JOIN but the WHERE clause references `books_fts MATCH ?` (the table name, not the alias). SQLite FTS5 accepts this, but it's inconsistent and could cause confusion. Additionally, using a three-way JOIN (books + obs + fts) may be suboptimal.
- **Fix**: Use the alias consistently:
  ```sql
  WHERE obs.organization_id = ? AND fts MATCH ?
  ```

---

## MEDIUM Findings

### M1. Duplicate Index Definitions Across Migrations

- **Category**: Migration
- **Severity**: MEDIUM
- **Files**: Multiple migrations create the same index
- **Examples**:
  - `idx_sessions_student_date` created in 0004 (line 32), recreated in 0020 (line 11), and attempted again in 0028 (line 10)
  - `idx_sessions_date` created in 0004 (line 28), recreated in 0026 (line 22)
  - `idx_book_selections_org_available` created in 0005 (line 26), similar to `idx_org_books_org_available` in 0020 (line 15)
  - `idx_organizations_wonde_school` partial in 0024 (line 59), non-partial in 0026 (line 17) - these are different indexes
- **Risk**: Wasted storage and slower writes. `IF NOT EXISTS` prevents errors but the duplicate in 0024 vs 0026 creates TWO different indexes on the same column (one partial, one full).
- **Fix**: Create a consolidation migration that drops the redundant duplicates. The partial index from 0024 (`WHERE wonde_school_id IS NOT NULL`) is strictly better since most rows have NULL wonde_school_id; drop the full index from 0026.

### M2. books.genre_ids: JSON Array Stored as TEXT

- **Category**: Schema / Normalization
- **Severity**: MEDIUM
- **File**: `migrations/0001_create_books_table.sql` line 13
- **Schema**: `genre_ids TEXT -- JSON array stored as text: ["genre-1", "genre-2"]`
- **Issue**: The `book_genres` junction table exists (migration 0007) but is not used anywhere in the codebase. All genre filtering uses `LIKE '%"genre-id"%'` on the JSON text column, which cannot use indexes and is prone to false positives (a genre ID that's a substring of another would match).
- **Risk**: Incorrect genre filtering; full table scan on every genre-based query.
- **Fix (Long-term)**: Migrate to use the `book_genres` junction table. Populate it from the JSON column, then switch queries to JOIN. Short-term: no action needed since the genre filter is only used in recommendations where LIMIT keeps result sets small.

### M3. books.reading_level: TEXT Column Used in Numeric Comparisons

- **Category**: Schema / Data Type
- **Severity**: MEDIUM
- **File**: `migrations/0001_create_books_table.sql` line 14, queries in `src/routes/books.js` lines 254-257
- **SQL**:
  ```sql
  CAST(b.reading_level AS REAL) >= ? AND CAST(b.reading_level AS REAL) <= ?
  ```
- **Issue**: `reading_level` is TEXT but is cast to REAL in every range query. This prevents index usage and forces a full scan of all books. Students have `reading_level_min`/`reading_level_max` as REAL (migration 0017), but books still use TEXT.
- **Fix**: Add `reading_level_numeric REAL` column to books and backfill:
  ```sql
  ALTER TABLE books ADD COLUMN reading_level_numeric REAL;
  UPDATE books SET reading_level_numeric = CAST(reading_level AS REAL)
    WHERE reading_level IS NOT NULL AND reading_level != '';
  CREATE INDEX IF NOT EXISTS idx_books_reading_level_numeric ON books(reading_level_numeric);
  ```
  Then update queries to use the numeric column.

### M4. login_attempts and rate_limits: Unbounded Growth Between Cleanups

- **Category**: Data Integrity
- **Severity**: MEDIUM
- **Files**: `migrations/0013_login_attempts.sql`, `migrations/0014_rate_limits.sql`
- **Issue**: Both tables grow unboundedly between cleanup runs:
  - `login_attempts` cleanup: commented-out SQL in migration, actual cleanup in cron (30-day retention) and async fire-and-forget after login (24 hours)
  - `rate_limits` cleanup: 1% probabilistic cleanup per request (line 336 of tenant.js), cron cleanup every run
  Under a brute-force attack, rate_limits could grow rapidly before the 1% cleanup fires.
- **Fix**: The cron cleanup handles this adequately for normal load. For attack scenarios, consider adding a hard cap: before inserting a new rate_limit entry, check if count > threshold and do a synchronous cleanup.

### M5. Wonde Sync: Employee-Class Mapping DELETE+INSERT Not Fully Atomic

- **Category**: Data Integrity
- **Severity**: MEDIUM
- **File**: `src/services/wondeSync.js` lines 264-291
- **Issue**: The employee-class rebuild does:
  1. DELETE all existing mappings for the org (in the first batch statement)
  2. INSERT new mappings in batches of 100

  If there are >99 employee-class mappings, the DELETE is in batch 1 but the remaining INSERTs are in batch 2+. If batch 2 fails, the old mappings are gone and the new ones are partially inserted.
- **Fix**: Include the DELETE as the first statement and accept partial atomicity (which is the current behavior), or restructure to use UPSERT:
  ```sql
  INSERT INTO wonde_employee_classes (...)
  VALUES (...)
  ON CONFLICT (organization_id, wonde_employee_id, wonde_class_id) DO UPDATE SET employee_name = ?
  ```
  This requires adding a UNIQUE constraint on (organization_id, wonde_employee_id, wonde_class_id).

### M6. Missing NOT NULL on Several Foreign Key Columns

- **Category**: Schema
- **Severity**: MEDIUM
- **Files**: Various migrations
- **Examples**:
  - `reading_sessions.student_id` is NOT NULL (correct)
  - `support_tickets.organization_id` is nullable (line 4 of 0031) - tickets should always belong to an org or be explicitly unattached
  - `support_ticket_notes.user_id` is nullable (line 4 of 0032) - system notes might not have a user, but this should be explicit
  - `wonde_sync_log.organization_id` is NOT NULL but has no ON DELETE CASCADE
  - `data_rights_log.organization_id` is NOT NULL but has no ON DELETE CASCADE
- **Fix**: For wonde_sync_log and data_rights_log, add ON DELETE CASCADE (requires table recreation in SQLite, so defer to a cleanup migration).

### M7. Genres Table: Global vs Per-Organization

- **Category**: Schema / Normalization
- **Severity**: MEDIUM
- **File**: `migrations/0007_genres.sql`
- **Issue**: Genres are global (no `organization_id`), which means all schools share the same genre list. If one school adds a custom genre (e.g., "Phonics Readers"), all schools see it. The UNIQUE constraint on `name` prevents two schools from having different descriptions for the same genre name.
- **Fix**: If per-org genres are needed, add `organization_id` column (nullable, NULL = global predefined). For now, this is acceptable since genres are essentially a controlled vocabulary.

### M8. Refresh Token Expiry Not Checked at Lookup Time

- **Category**: Data Integrity
- **Severity**: MEDIUM
- **File**: `src/routes/auth.js` lines 443-449
- **SQL**:
  ```sql
  SELECT rt.*, u.email, u.name, u.role, ...
  FROM refresh_tokens rt
  INNER JOIN users u ON rt.user_id = u.id
  INNER JOIN organizations o ON u.organization_id = o.id
  WHERE rt.token_hash = ? AND rt.revoked_at IS NULL
  ```
- **Issue**: The query checks `revoked_at IS NULL` but does NOT check `rt.expires_at > datetime('now')`. Expired tokens pass the SQL check and are only validated in JS (line 455-461).
- **Fix**: Add to WHERE clause:
  ```sql
  AND rt.expires_at > datetime('now')
  ```
  This is defense-in-depth; the JS check exists but adding it to SQL is more efficient.

### M9. Missing Index: class_assignments for Login Flow

- **Category**: Index
- **Severity**: MEDIUM
- **Files**: `src/routes/auth.js` lines 344-346, `src/routes/mylogin.js` lines 266-268
- **SQL**:
  ```sql
  SELECT class_id FROM class_assignments WHERE user_id = ?
  ```
- **Issue**: This runs on every login and every token refresh. The `idx_class_assignments_user` index (migration 0030) covers this query, so this is actually fine. Verified.

### M10. books_fts: Standalone FTS Table Drift Risk

- **Category**: Data Integrity
- **Severity**: MEDIUM
- **File**: `migrations/0019_fix_fts5_rowid.sql`
- **Issue**: The FTS table is standalone (not content-synced). Triggers keep it in sync, but if a book is modified via `db.batch()` and a trigger fails silently, the FTS index drifts. Additionally, the import/confirm endpoint (books.js line 1246) inserts books via batch which should fire triggers, but D1's trigger behavior in batch mode should be verified.
- **Fix**: Add a periodic FTS rebuild to the cron job:
  ```sql
  DELETE FROM books_fts;
  INSERT INTO books_fts(id, title, author) SELECT id, title, author FROM books;
  ```
  Run this weekly or after bulk imports.

---

## LOW Findings

### L1. Migration 0001: DROP TABLE Before CREATE TABLE

- **Category**: Migration
- **Severity**: LOW
- **File**: `migrations/0001_create_books_table.sql` line 6
- **SQL**: `DROP TABLE IF EXISTS books;`
- **Issue**: The first migration drops the books table unconditionally, then recreates it. This is dangerous if re-run: all book data would be lost. Later migrations all use `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` safely.
- **Fix**: Remove the DROP TABLE. The `CREATE TABLE IF NOT EXISTS` on line 9 is sufficient. Since this is the first migration and already applied to production, this is historical only.

### L2. Migration 0008: ALTER TABLE Without IF NOT EXISTS

- **Category**: Migration
- **Severity**: LOW
- **File**: `migrations/0008_add_missing_columns.sql`
- **SQL**:
  ```sql
  ALTER TABLE classes ADD COLUMN teacher_name TEXT;
  ALTER TABLE classes ADD COLUMN academic_year TEXT;
  ```
- **Issue**: SQLite `ALTER TABLE ADD COLUMN` fails if the column already exists (no `IF NOT EXISTS` support for ALTER in SQLite). If this migration runs twice, it will error.
- **Fix**: D1 migrations are idempotent by tracking which have been applied, so this is not a runtime risk. But it's a gotcha for local development with `--local` flag.

### L3. Migration 0018: Hardcoded Organization ID

- **Category**: Migration
- **Severity**: LOW
- **File**: `migrations/0018_assign_books_to_org.sql`
- **Issue**: Contains a hardcoded UUID (`b1191a0e-d1b5-4f6b-bf7e-9454d53da417`) for the initial organization. This is fine as a one-time data migration but would be confusing to future developers.
- **Fix**: Add a comment explaining this was the production org ID at time of migration.

### L4. Unused Column: students.reading_level (TEXT, superseded by reading_level_min/max)

- **Category**: Schema
- **Severity**: LOW
- **File**: `migrations/0017_reading_level_range.sql` comment at line 33
- **Issue**: The old `reading_level` TEXT column is still present on the students table. Migration 0017 added `reading_level_min`/`reading_level_max` REAL columns and migrated data, but kept the old column "for rollback safety." This was 17 migrations ago.
- **Fix**: Add a cleanup migration to drop the column (requires table recreation in SQLite, or just leave it as dead weight since it's NULL for all records).

### L5. Unused Table: book_genres Junction Table

- **Category**: Schema
- **Severity**: LOW
- **File**: `migrations/0007_genres.sql` lines 42-53
- **Issue**: The `book_genres` table was created as a normalized alternative to the `genre_ids` JSON column on books, but no code in the codebase reads from or writes to it.
- **Fix**: Either start using it (see M2) or drop it in a cleanup migration.

### L6. classes.is_active vs classes.disabled: Two Soft-Delete Mechanisms

- **Category**: Schema
- **Severity**: LOW
- **Files**: `migrations/0003_classes_students.sql` (is_active), `migrations/0027_classes_disabled.sql` (disabled)
- **Issue**: Classes have both `is_active` (used by soft delete in DELETE route) and `disabled` (used by frontend to hide from dropdowns). Some queries filter by `is_active = 1`, others by `disabled = 0`, and some by both. This dual mechanism is confusing.
- **Fix**: Document the distinction clearly: `is_active = 0` means deleted, `disabled = 1` means hidden but not deleted. Consider merging into a single `status` ENUM column in a future refactor.

### L7. email_signups: INTEGER PRIMARY KEY vs TEXT IDs Everywhere Else

- **Category**: Schema
- **Severity**: LOW
- **File**: `migrations/0023_email_signups.sql`
- **Issue**: This is the only table using `INTEGER PRIMARY KEY AUTOINCREMENT`. All other tables use `TEXT PRIMARY KEY` with UUIDs. Not a bug, but inconsistent.
- **Fix**: No action needed; this is a standalone public-facing table with no foreign keys.

### L8. Missing Index: wonde_sync_log for Status Queries

- **Category**: Index
- **Severity**: LOW
- **File**: `migrations/0024_wonde_mylogin_integration.sql`
- **Issue**: `wonde_sync_log` has `idx_sync_log_org` on organization_id but no composite index for queries like "latest sync per org" which would need `(organization_id, started_at DESC)`.
- **Fix**:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_sync_log_org_started ON wonde_sync_log(organization_id, started_at DESC);
  ```

---

## Suggested Composite Indexes for Multi-School Scale

These indexes are recommended for a deployment with 10+ schools:

```sql
-- 1. Students by org + class + active (most common filter combo)
CREATE INDEX IF NOT EXISTS idx_students_org_class_active
  ON students(organization_id, class_id, is_active);

-- 2. Reading sessions by student + date + book (covers session list + profile queries)
-- Already exists as idx_sessions_student_date; no change needed.

-- 3. Users by email (login) - already unique index, no change needed.

-- 4. Books: numeric reading level for range queries
-- Requires adding reading_level_numeric column (see M3)

-- 5. Refresh tokens: expiry-aware lookup
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash_active
  ON refresh_tokens(token_hash) WHERE revoked_at IS NULL;

-- 6. Audit log: cleanup queries by date
-- Already covered by idx_audit_org_created
```

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| CRITICAL | 4     | Tenant isolation, non-atomic writes, SQL interpolation |
| HIGH     | 7     | Missing org scoping, N+1 queries, streak cron scaling, FTS alias |
| MEDIUM   | 10    | Duplicate indexes, schema normalization, token expiry |
| LOW      | 8     | Migration hygiene, unused columns/tables, naming inconsistency |

**Recommended priority order**:
1. C1 (tenant isolation fix) - one-line SQL change, deploy immediately
2. C4 (parameterized LIMIT) - one-line fix
3. C2 (is_active filter) - one-line fix
4. C3 (batch session+book update) - small refactor
5. H3 (batch streak UPDATEs) - reduces cron D1 calls by 10x
6. H5 (user delete is_active) - one-line fix
7. H6 (orphan cleanup NOT EXISTS) - one-line fix
8. H7 (FTS alias) - cosmetic but prevents future bugs
9. M3 (numeric reading level) - requires migration + query updates
10. M1 (duplicate indexes) - cleanup migration
