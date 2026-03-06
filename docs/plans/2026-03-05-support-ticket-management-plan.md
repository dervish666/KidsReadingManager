# Support Ticket Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an owner-only support ticket management page within SettingsPage, with master-detail layout, status management, and internal notes.

**Architecture:** New migration adds `support_ticket_notes` table and `updated_at` to `support_tickets`. Four new GET/PATCH/POST endpoints on the existing `supportRouter` with `requireOwner()`. New `SupportTicketManager` component renders as a tab in `SettingsPage`.

**Tech Stack:** Hono routes, D1 SQL, React 19, Material-UI v7, Vitest

**Design doc:** `docs/plans/2026-03-05-support-ticket-management-design.md`

---

### Task 1: Database Migration

**Files:**
- Create: `migrations/0032_support_ticket_notes.sql`

**Step 1: Create migration file**

```sql
-- Support ticket notes and updated_at tracking
CREATE TABLE IF NOT EXISTS support_ticket_notes (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id)
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_notes_ticket
  ON support_ticket_notes(ticket_id, created_at);

ALTER TABLE support_tickets ADD COLUMN updated_at TEXT;
```

**Step 2: Apply locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`
Expected: Migration applies successfully.

**Step 3: Commit**

```bash
git add migrations/0032_support_ticket_notes.sql
git commit -m "feat: add support_ticket_notes table and updated_at column (migration 0032)"
```

---

### Task 2: Row Mapper

**Files:**
- Modify: `src/utils/rowMappers.js` (add at bottom)

**Step 1: Add `rowToSupportTicket` and `rowToSupportNote` mappers**

Add to `src/utils/rowMappers.js` after the genres mapper:

```js
// ── Support Tickets ─────────────────────────────────────────────────────────

export const rowToSupportTicket = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id || null,
    organizationName: row.organization_name || null,
    userId: row.user_id || null,
    userName: row.user_name,
    userEmail: row.user_email,
    subject: row.subject,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
};

export const rowToSupportNote = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    ticketId: row.ticket_id,
    userId: row.user_id || null,
    userName: row.user_name,
    note: row.note,
    createdAt: row.created_at,
  };
};
```

**Step 2: Commit**

```bash
git add src/utils/rowMappers.js
git commit -m "feat: add rowToSupportTicket and rowToSupportNote mappers"
```

---

### Task 3: Backend — GET /api/support (list tickets)

**Files:**
- Modify: `src/routes/support.js`
- Test: `src/__tests__/integration/support.test.js`

**Step 1: Write failing tests**

Add to `src/__tests__/integration/support.test.js` after the existing `describe` block:

```js
describe('GET /api/support', () => {
  it('returns all tickets for owner', async () => {
    const ticketRows = [
      { id: 'ticket-1', organization_id: 'org-1', user_id: 'user-1', user_name: 'Jane', user_email: 'jane@test.com', subject: 'Help', message: 'Need help', status: 'open', created_at: '2026-03-05T10:00:00Z', updated_at: null, organization_name: 'Test School' },
      { id: 'ticket-2', organization_id: 'org-2', user_id: 'user-2', user_name: 'Bob', user_email: 'bob@test.com', subject: 'Bug', message: 'Found bug', status: 'resolved', created_at: '2026-03-04T10:00:00Z', updated_at: '2026-03-05T10:00:00Z', organization_name: 'Other School' },
    ];

    const { app } = createTestApp(
      { userId: 'owner-1', userRole: 'owner', user: { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' } },
      { allResults: { results: ticketRows, success: true } }
    );

    const res = await makeRequest(app, 'GET', '/api/support');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tickets).toHaveLength(2);
    expect(data.tickets[0].id).toBe('ticket-1');
    expect(data.tickets[0].organizationName).toBe('Test School');
  });

  it('rejects non-owner users', async () => {
    const { app } = createTestApp({
      userId: 'user-1', userRole: 'teacher',
      user: { sub: 'user-1', name: 'Jane', email: 'jane@test.com' },
    });

    const res = await makeRequest(app, 'GET', '/api/support');
    expect(res.status).toBe(403);
  });

  it('filters by status when query param provided', async () => {
    const { app, mockDB } = createTestApp(
      { userId: 'owner-1', userRole: 'owner', user: { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' } },
      { allResults: { results: [], success: true } }
    );

    await makeRequest(app, 'GET', '/api/support?status=open');
    expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining("st.status = ?"));
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/integration/support.test.js`
Expected: 3 new tests FAIL (GET route doesn't exist yet).

**Step 3: Implement GET /api/support**

In `src/routes/support.js`, add imports and the GET route:

```js
import { requireOwner } from '../middleware/tenant.js';
import { rowToSupportTicket } from '../utils/rowMappers.js';

supportRouter.get('/', requireOwner(), async (c) => {
  const db = c.env.READING_MANAGER_DB;
  if (!db) {
    return c.json({ error: 'Database not available' }, 500);
  }

  const status = c.req.query('status');
  const validStatuses = ['open', 'in-progress', 'resolved'];

  let sql = `
    SELECT st.*, o.name AS organization_name
    FROM support_tickets st
    LEFT JOIN organizations o ON st.organization_id = o.id
  `;
  const binds = [];

  if (status && validStatuses.includes(status)) {
    sql += ' WHERE st.status = ?';
    binds.push(status);
  }

  sql += ' ORDER BY st.created_at DESC';

  const result = await db.prepare(sql).bind(...binds).all();
  const tickets = (result.results || []).map(rowToSupportTicket);

  return c.json({ tickets });
});
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/integration/support.test.js`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/routes/support.js src/__tests__/integration/support.test.js
git commit -m "feat: add GET /api/support endpoint for listing tickets (owner only)"
```

---

### Task 4: Backend — GET /api/support/:id (ticket detail with notes)

**Files:**
- Modify: `src/routes/support.js`
- Modify: `src/__tests__/integration/support.test.js`

**Step 1: Write failing tests**

```js
describe('GET /api/support/:id', () => {
  it('returns ticket with notes', async () => {
    const ticketRow = { id: 'ticket-1', organization_id: 'org-1', user_id: 'user-1', user_name: 'Jane', user_email: 'jane@test.com', subject: 'Help', message: 'Need help', status: 'open', created_at: '2026-03-05T10:00:00Z', updated_at: null, organization_name: 'Test School' };
    const noteRows = [
      { id: 'note-1', ticket_id: 'ticket-1', user_id: 'owner-1', user_name: 'Owner', note: 'Looking into it', created_at: '2026-03-05T11:00:00Z' },
    ];

    const mockDB = createMockDB();
    // first prepare().bind().first() returns ticket, second prepare().bind().all() returns notes
    let callCount = 0;
    mockDB.prepare = vi.fn().mockImplementation(() => ({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(callCount++ === 0 ? ticketRow : null),
        all: vi.fn().mockResolvedValue({ results: noteRows, success: true }),
      }),
    }));

    const app = new Hono();
    app.use('*', async (c, next) => {
      c.env = { READING_MANAGER_DB: mockDB };
      c.set('userRole', 'owner');
      c.set('userId', 'owner-1');
      c.set('user', { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' });
      await next();
    });
    app.route('/api/support', supportRouter);

    const res = await makeRequest(app, 'GET', '/api/support/ticket-1');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ticket.id).toBe('ticket-1');
    expect(data.notes).toHaveLength(1);
    expect(data.notes[0].note).toBe('Looking into it');
  });

  it('returns 404 for non-existent ticket', async () => {
    const { app } = createTestApp(
      { userId: 'owner-1', userRole: 'owner', user: { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' } },
      { firstResult: null }
    );

    const res = await makeRequest(app, 'GET', '/api/support/nonexistent');
    expect(res.status).toBe(404);
  });
});
```

**Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/__tests__/integration/support.test.js`

**Step 3: Implement GET /api/support/:id**

```js
import { rowToSupportNote } from '../utils/rowMappers.js';

supportRouter.get('/:id', requireOwner(), async (c) => {
  const db = c.env.READING_MANAGER_DB;
  if (!db) {
    return c.json({ error: 'Database not available' }, 500);
  }

  const ticketId = c.req.param('id');

  const ticketRow = await db.prepare(`
    SELECT st.*, o.name AS organization_name
    FROM support_tickets st
    LEFT JOIN organizations o ON st.organization_id = o.id
    WHERE st.id = ?
  `).bind(ticketId).first();

  if (!ticketRow) {
    return c.json({ error: 'Ticket not found' }, 404);
  }

  const notesResult = await db.prepare(
    'SELECT * FROM support_ticket_notes WHERE ticket_id = ? ORDER BY created_at ASC'
  ).bind(ticketId).all();

  const ticket = rowToSupportTicket(ticketRow);
  const notes = (notesResult.results || []).map(rowToSupportNote);

  return c.json({ ticket, notes });
});
```

**Step 4: Run tests — expect PASS**

Run: `npx vitest run src/__tests__/integration/support.test.js`

**Step 5: Commit**

```bash
git add src/routes/support.js src/__tests__/integration/support.test.js
git commit -m "feat: add GET /api/support/:id endpoint for ticket detail with notes"
```

---

### Task 5: Backend — PATCH /api/support/:id (update status)

**Files:**
- Modify: `src/routes/support.js`
- Modify: `src/__tests__/integration/support.test.js`

**Step 1: Write failing tests**

```js
describe('PATCH /api/support/:id', () => {
  it('updates ticket status', async () => {
    const { app, mockDB } = createTestApp(
      { userId: 'owner-1', userRole: 'owner', user: { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' } },
      { firstResult: { id: 'ticket-1', status: 'open' } }
    );

    const res = await makeRequest(app, 'PATCH', '/api/support/ticket-1', { status: 'in-progress' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE support_tickets SET status')
    );
  });

  it('rejects invalid status', async () => {
    const { app } = createTestApp(
      { userId: 'owner-1', userRole: 'owner', user: { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' } },
      { firstResult: { id: 'ticket-1', status: 'open' } }
    );

    const res = await makeRequest(app, 'PATCH', '/api/support/ticket-1', { status: 'deleted' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent ticket', async () => {
    const { app } = createTestApp(
      { userId: 'owner-1', userRole: 'owner', user: { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' } },
      { firstResult: null }
    );

    const res = await makeRequest(app, 'PATCH', '/api/support/nonexistent', { status: 'resolved' });
    expect(res.status).toBe(404);
  });
});
```

**Step 2: Run tests — expect FAIL**

**Step 3: Implement PATCH /api/support/:id**

```js
supportRouter.patch('/:id', requireOwner(), async (c) => {
  const db = c.env.READING_MANAGER_DB;
  if (!db) {
    return c.json({ error: 'Database not available' }, 500);
  }

  const ticketId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const validStatuses = ['open', 'in-progress', 'resolved'];
  if (!body.status || !validStatuses.includes(body.status)) {
    return c.json({ error: 'Invalid status. Must be: open, in-progress, or resolved' }, 400);
  }

  const existing = await db.prepare('SELECT id FROM support_tickets WHERE id = ?').bind(ticketId).first();
  if (!existing) {
    return c.json({ error: 'Ticket not found' }, 404);
  }

  await db.prepare(
    "UPDATE support_tickets SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(body.status, ticketId).run();

  return c.json({ success: true });
});
```

**Step 4: Run tests — expect PASS**

**Step 5: Commit**

```bash
git add src/routes/support.js src/__tests__/integration/support.test.js
git commit -m "feat: add PATCH /api/support/:id endpoint for status updates"
```

---

### Task 6: Backend — POST /api/support/:id/notes (add note)

**Files:**
- Modify: `src/routes/support.js`
- Modify: `src/__tests__/integration/support.test.js`

**Step 1: Write failing tests**

```js
describe('POST /api/support/:id/notes', () => {
  it('adds a note to a ticket', async () => {
    const { app, mockDB } = createTestApp(
      { userId: 'owner-1', userRole: 'owner', user: { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' } },
      { firstResult: { id: 'ticket-1' } }
    );

    const res = await makeRequest(app, 'POST', '/api/support/ticket-1/notes', { note: 'Working on it' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.noteId).toBeDefined();

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO support_ticket_notes')
    );
  });

  it('rejects empty note', async () => {
    const { app } = createTestApp(
      { userId: 'owner-1', userRole: 'owner', user: { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' } },
    );

    const res = await makeRequest(app, 'POST', '/api/support/ticket-1/notes', { note: '' });
    expect(res.status).toBe(400);
  });

  it('rejects note exceeding 2000 characters', async () => {
    const { app } = createTestApp(
      { userId: 'owner-1', userRole: 'owner', user: { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' } },
    );

    const res = await makeRequest(app, 'POST', '/api/support/ticket-1/notes', { note: 'x'.repeat(2001) });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent ticket', async () => {
    const { app } = createTestApp(
      { userId: 'owner-1', userRole: 'owner', user: { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' } },
      { firstResult: null }
    );

    const res = await makeRequest(app, 'POST', '/api/support/nonexistent/notes', { note: 'Test' });
    expect(res.status).toBe(404);
  });
});
```

**Step 2: Run tests — expect FAIL**

**Step 3: Implement POST /api/support/:id/notes**

```js
supportRouter.post('/:id/notes', requireOwner(), async (c) => {
  const db = c.env.READING_MANAGER_DB;
  if (!db) {
    return c.json({ error: 'Database not available' }, 500);
  }

  const ticketId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const noteText = typeof body.note === 'string' ? body.note.trim() : '';
  if (!noteText) {
    return c.json({ error: 'Note is required' }, 400);
  }
  if (noteText.length > 2000) {
    return c.json({ error: 'Note must be 2000 characters or less' }, 400);
  }

  const existing = await db.prepare('SELECT id FROM support_tickets WHERE id = ?').bind(ticketId).first();
  if (!existing) {
    return c.json({ error: 'Ticket not found' }, 404);
  }

  const user = c.get('user');
  const userId = c.get('userId') || user.sub || null;
  const noteId = generateId();

  await db.batch([
    db.prepare(
      'INSERT INTO support_ticket_notes (id, ticket_id, user_id, user_name, note) VALUES (?, ?, ?, ?, ?)'
    ).bind(noteId, ticketId, userId, user.name || 'Unknown', noteText),
    db.prepare(
      "UPDATE support_tickets SET updated_at = datetime('now') WHERE id = ?"
    ).bind(ticketId),
  ]);

  return c.json({ success: true, noteId });
});
```

**Step 4: Run tests — expect PASS**

**Step 5: Commit**

```bash
git add src/routes/support.js src/__tests__/integration/support.test.js
git commit -m "feat: add POST /api/support/:id/notes endpoint for internal notes"
```

---

### Task 7: Frontend — SupportTicketManager Component

**Files:**
- Create: `src/components/SupportTicketManager.js`

**Step 1: Create the component**

Build a master-detail layout with:
- Left panel (~40%): status filter chips (All/Open/In Progress/Resolved with counts), scrollable ticket list as cards (subject, user name, org name, relative time, status chip), selected ticket highlighted
- Right panel (~60%): full message, submitter info block (name, email, org), status Select dropdown, notes timeline, "Add note" TextField + button
- Mobile responsive: stack vertically, detail as overlay with back button
- Use existing app styling: Nunito headings, DM Sans body, `#6B8E6B` accent, `#4A4A4A` text, cream backgrounds (`#FFFEF9`), `16px` border radius
- Status chip colors: open = `#E8A849` (amber), in-progress = `#5B8DB8` (blue), resolved = `#6B8E6B` (green)
- Fetch tickets via `fetchWithAuth('/api/support')`, detail via `fetchWithAuth('/api/support/${id}')`
- PATCH status via `fetchWithAuth('/api/support/${id}', { method: 'PATCH', ... })`
- POST notes via `fetchWithAuth('/api/support/${id}/notes', { method: 'POST', ... })`
- Use `useAppContext` for `fetchWithAuth` and `user`

Refer to existing components like `UserManagement.js` and `SchoolManagement.js` for styling patterns. Use `useCallback` for fetch functions to avoid stale closures. Use `useState` for local state (tickets, selectedTicket, notes, filters, newNote, loading states).

**Step 2: Commit**

```bash
git add src/components/SupportTicketManager.js
git commit -m "feat: add SupportTicketManager component with master-detail layout"
```

---

### Task 8: Integrate into SettingsPage

**Files:**
- Modify: `src/components/SettingsPage.js`

**Step 1: Add the Support Tickets tab (owner only)**

In `src/components/SettingsPage.js`:

1. Add import: `import SupportTicketManager from './SupportTicketManager';`
2. Add icon import: `import SupportAgentIcon from '@mui/icons-material/SupportAgent';`
3. Add a new `<Tab>` inside the `<Tabs>` block, conditionally rendered with `{isOwner && ...}`, after the School Management tab:
   ```jsx
   {isOwner && (
     <Tab icon={<SupportAgentIcon />} iconPosition="start" label="Support Tickets" />
   )}
   ```
4. Add the panel render in the tab content `<Box>`, accounting for conditional tab indices:
   ```jsx
   {isOwner && currentTab === (canManageUsers ? 6 : 5) && <SupportTicketManager />}
   ```

**Step 2: Verify manually**

Run: `npm run start:dev`
- Log in as owner → Settings → "Support Tickets" tab should appear
- Non-owner users should not see the tab

**Step 3: Commit**

```bash
git add src/components/SettingsPage.js
git commit -m "feat: add Support Tickets tab to SettingsPage (owner only)"
```

---

### Task 9: Update Structure Index

**Files:**
- Modify: `CLAUDE.md` (file map section — add SupportTicketManager entry)
- Modify: `.claude/structure/components.yaml` (add SupportTicketManager)
- Modify: `.claude/structure/routes.yaml` (add new support endpoints)

**Step 1: Update file map in CLAUDE.md**

Add after the SupportModal entry:
```
src/components/SupportTicketManager.js - Owner-only support ticket list with detail panel, status management, internal notes
```

**Step 2: Update structure YAML files**

Add the new endpoints to `routes.yaml` under the support section, and the new component to `components.yaml`.

**Step 3: Commit**

```bash
git add CLAUDE.md .claude/structure/components.yaml .claude/structure/routes.yaml
git commit -m "docs: update structure index for support ticket management"
```

---

### Task 10: Run Full Test Suite and Verify Build

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass (existing + new support tests).

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Bump version**

Update `package.json` version to `3.10.7`. Update health endpoint version in `src/worker.js` if it has a hardcoded version.

**Step 4: Final commit**

```bash
git add package.json src/worker.js
git commit -m "chore: bump version to 3.10.7"
```
