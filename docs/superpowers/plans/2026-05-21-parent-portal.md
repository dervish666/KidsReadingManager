# Parent Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a QR-code-accessed parent portal where parents can view their child's reading progress and log home reading sessions — no account, no password.

**Architecture:** New `/parent/:token` route in the existing SPA, backed by public API endpoints in `src/routes/parent.js`. Access via 128-bit random tokens stored in a new `parent_access_tokens` D1 table. Teacher-facing QR code generation and bulk print from class and student views.

**Tech Stack:** React 19, MUI v7, Hono, D1, `qrcode.react` (new dependency), existing components (GardenHeader, StreakBadge, BookCover, BadgeCelebration)

---

## File Structure

**New files:**
- `migrations/0056_parent_access_tokens.sql` — DB migration
- `src/routes/parent.js` — API route handlers (public + teacher-facing)
- `src/components/parent/ParentPortal.js` — Main parent view (data fetch, layout, session logging, book search)
- `src/components/parent/QRCodeSheet.js` — Printable QR code grid for a class
- `src/components/parent/ParentQRButton.js` — Shared QR code button + single-student QR dialog
- `src/__tests__/unit/parentTokens.test.js` — Token generation and validation tests
- `src/__tests__/unit/parentRoutes.test.js` — API route handler tests

**Modified files:**
- `src/worker.js` — Import and mount `parentRouter`
- `src/utils/constants.js` — Add parent paths to `PUBLIC_PATHS`
- `src/utils/helpers.js` — Add `generateToken()` function
- `src/App.js` — Add `/parent/:token` standalone page bypass
- `src/components/classes/ClassManager.js` — Add "Parent QR Codes" button per class
- `src/components/students/StudentDetailDrawer.js` — Add per-student QR code action
- `src/components/students/StudentList.js` — Add QR codes toolbar button
- `package.json` — Add `qrcode.react` dependency

---

### Task 1: Database Migration

**Files:**
- Create: `migrations/0056_parent_access_tokens.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Parent access tokens for QR-code-based parent portal
CREATE TABLE IF NOT EXISTS parent_access_tokens (
    id TEXT PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    student_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    created_by TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_parent_tokens_token ON parent_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_parent_tokens_student ON parent_access_tokens(student_id);
CREATE INDEX IF NOT EXISTS idx_parent_tokens_org_year ON parent_access_tokens(organization_id, academic_year);
```

- [ ] **Step 2: Apply migration locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`
Expected: Migration applies successfully.

- [ ] **Step 3: Commit**

```bash
git add migrations/0056_parent_access_tokens.sql
git commit -m "feat(parent): add parent_access_tokens migration"
```

---

### Task 2: Token Generation Utility + Tests

**Files:**
- Modify: `src/utils/helpers.js`
- Create: `src/__tests__/unit/parentTokens.test.js`

- [ ] **Step 1: Write failing tests for token generation**

Create `src/__tests__/unit/parentTokens.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { generateToken } from '../../utils/helpers.js';

describe('generateToken', () => {
  it('should return a URL-safe base64 string', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('should return a 22-character string (128 bits)', () => {
    const token = generateToken();
    expect(token.length).toBe(22);
  });

  it('should generate unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
    expect(tokens.size).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/unit/parentTokens.test.js`
Expected: FAIL — `generateToken` is not exported from helpers.js

- [ ] **Step 3: Implement generateToken**

Add to `src/utils/helpers.js` after the existing `generateId` function:

```javascript
/**
 * Generate a 128-bit URL-safe base64 token (22 chars).
 * Used for parent portal access links.
 */
export function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/unit/parentTokens.test.js`
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/helpers.js src/__tests__/unit/parentTokens.test.js
git commit -m "feat(parent): add generateToken utility with tests"
```

---

### Task 3: API Route — Token Validation Helper + Parent View Endpoint

**Files:**
- Create: `src/routes/parent.js`
- Modify: `src/worker.js`
- Modify: `src/utils/constants.js`

- [ ] **Step 1: Create parent route file with token validation and GET endpoint**

Create `src/routes/parent.js`:

```javascript
import { Hono } from 'hono';
import { requireTeacher } from '../middleware/tenant.js';
import { requireDB } from '../utils/routeHelpers.js';
import { generateId, generateToken } from '../utils/helpers.js';
import { notFoundError, badRequestError } from '../middleware/errorHandler.js';
import { getOrgStreakSettings, updateStudentStreak } from './students/_shared.js';
import { getDateString } from '../utils/streakCalculator.js';
import { recalculateStats, evaluateRealTime } from '../utils/badgeEngine.js';
import { updateClassGoalOnSession } from '../utils/classGoalsEngine.js';
import { rateLimit } from '../middleware/tenant.js';

const parentRouter = new Hono();

// ---------------------------------------------------------------------------
// Shared: validate token, return student + org context
// ---------------------------------------------------------------------------

async function validateParentToken(db, token) {
  const row = await db
    .prepare(
      `SELECT pat.*, s.name as student_name, s.current_book_id, s.processing_restricted,
              s.year_group, s.is_active as student_active
       FROM parent_access_tokens pat
       JOIN students s ON pat.student_id = s.id
       WHERE pat.token = ? AND pat.revoked_at IS NULL`
    )
    .bind(token)
    .first();

  if (!row || !row.student_active) return null;

  // Check academic year is current (Sept–Aug cycle)
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-indexed
  const currentYear = now.getFullYear();
  const academicStartYear = currentMonth >= 8 ? currentYear : currentYear - 1;
  const currentAcademicYear = `${academicStartYear}-${academicStartYear + 1}`;

  if (row.academic_year !== currentAcademicYear) return null;

  return row;
}

// ---------------------------------------------------------------------------
// Public: GET /api/parent/:token — parent view data
// ---------------------------------------------------------------------------

parentRouter.get('/:token', rateLimit(60), async (c) => {
  const db = requireDB(c.env);
  const { token } = c.req.param();

  const access = await validateParentToken(db, token);
  if (!access) throw notFoundError('Not found');

  const studentId = access.student_id;
  const organizationId = access.organization_id;
  const firstName = (access.student_name || '').split(' ')[0];

  // Current book
  let currentBook = null;
  if (access.current_book_id) {
    const book = await db
      .prepare('SELECT id, title, author, isbn FROM books WHERE id = ?')
      .bind(access.current_book_id)
      .first();
    if (book) {
      currentBook = {
        id: book.id,
        title: book.title,
        author: book.author,
        coverUrl: book.isbn ? `/api/covers/isbn/${book.isbn}` : null,
      };
    }
  }

  // Streak
  const { timezone } = await getOrgStreakSettings(db, organizationId, c.env || {});
  const streakRow = await db
    .prepare('SELECT current_streak, streak_last_date FROM reading_stats WHERE student_id = ? AND organization_id = ?')
    .bind(studentId, organizationId)
    .first();

  const today = getDateString(new Date(), timezone);
  const yesterday = getDateString(new Date(Date.now() - 86400000), timezone);
  const lastDate = streakRow?.streak_last_date;
  const isActive = lastDate === today || lastDate === yesterday;

  // Recent sessions (last 30)
  const sessionsResult = await db
    .prepare(
      `SELECT rs.session_date, rs.location, rs.book_id,
              COALESCE(b.title, rs.book_title_manual) as book_title
       FROM reading_sessions rs
       LEFT JOIN books b ON rs.book_id = b.id
       WHERE rs.student_id = ?
       ORDER BY rs.session_date DESC, rs.created_at DESC
       LIMIT 30`
    )
    .bind(studentId)
    .all();

  const sessions = (sessionsResult.results || []).map((r) => ({
    date: r.session_date,
    bookTitle: r.book_title,
    location: r.location || 'school',
  }));

  // Badge count for garden
  const badgeRow = await db
    .prepare('SELECT COUNT(*) as count FROM badges WHERE student_id = ? AND organization_id = ?')
    .bind(studentId, organizationId)
    .first();

  return c.json({
    studentFirstName: firstName,
    currentBook,
    streak: { current: streakRow?.current_streak || 0, isActive },
    sessions,
    badgeCount: badgeRow?.count || 0,
  });
});

export { parentRouter };
```

- [ ] **Step 2: Add parent paths to PUBLIC_PATHS**

In `src/utils/constants.js`, add to the `PUBLIC_PATHS` array:

```javascript
  '/api/contact',
  // Parent portal (token-authenticated, no JWT)
  '/api/parent',
];
```

Note: The tenant middleware check in `src/worker.js` uses `PUBLIC_PATHS.includes(url.pathname)` for exact matches, but parent routes are dynamic (`/api/parent/:token`). We need to add a `startsWith` check specifically for `/api/parent/`. In `src/worker.js`, update the two middleware `use('/api/*')` blocks that check PUBLIC_PATHS (lines ~217 and ~233) to also check:

```javascript
|| url.pathname.startsWith('/api/parent/')
```

Add this alongside the existing `/api/covers/` startsWith check.

- [ ] **Step 3: Register route in worker.js**

In `src/worker.js`:

Add import at the top with the other route imports:
```javascript
import { parentRouter } from './routes/parent.js';
```

Add route registration with the other `app.route()` calls:
```javascript
app.route('/api/parent', parentRouter);
```

- [ ] **Step 4: Update worker.js middleware to bypass auth for parent routes**

In `src/worker.js`, find the two middleware blocks that check `PUBLIC_PATHS` (around lines 217 and 233). In both, update the condition:

Before:
```javascript
if (PUBLIC_PATHS.includes(url.pathname) || url.pathname.startsWith('/api/covers/')) {
```

After:
```javascript
if (PUBLIC_PATHS.includes(url.pathname) || url.pathname.startsWith('/api/covers/') || url.pathname.startsWith('/api/parent/')) {
```

- [ ] **Step 5: Run lint to check for issues**

Run: `npm run lint`
Expected: No errors in the new/modified files.

- [ ] **Step 6: Commit**

```bash
git add src/routes/parent.js src/worker.js src/utils/constants.js
git commit -m "feat(parent): add parent view API endpoint with token validation"
```

---

### Task 4: API Route — Session Creation Endpoint

**Files:**
- Modify: `src/routes/parent.js`

- [ ] **Step 1: Add POST session endpoint to parent.js**

Add after the GET endpoint in `src/routes/parent.js`:

```javascript
// ---------------------------------------------------------------------------
// Public: POST /api/parent/:token/sessions — log home reading
// ---------------------------------------------------------------------------

parentRouter.post('/:token/sessions', rateLimit(10), async (c) => {
  const db = requireDB(c.env);
  const { token } = c.req.param();

  const access = await validateParentToken(db, token);
  if (!access) throw notFoundError('Not found');

  if (access.processing_restricted) {
    return c.json({ error: 'Processing is restricted for this student.' }, 403);
  }

  const body = await c.req.json();
  const studentId = access.student_id;
  const organizationId = access.organization_id;

  // Validate date
  const { timezone } = await getOrgStreakSettings(db, organizationId, c.env || {});
  const sessionDate = body.sessionDate || getDateString(new Date(), timezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate) || isNaN(Date.parse(sessionDate))) {
    throw badRequestError('sessionDate must be a valid YYYY-MM-DD format');
  }

  // Don't allow future dates
  const today = getDateString(new Date(), timezone);
  if (sessionDate > today) {
    throw badRequestError('Cannot log reading for a future date');
  }

  // Duplicate guard: one home session per student per date
  const existing = await db
    .prepare(
      `SELECT 1 FROM reading_sessions
       WHERE student_id = ? AND session_date = ? AND location = 'home'
       LIMIT 1`
    )
    .bind(studentId, sessionDate)
    .first();

  if (existing) {
    return c.json({ error: 'Already logged home reading for this date', duplicate: true }, 409);
  }

  // Validate book (if provided)
  let bookId = null;
  let bookTitleManual = null;
  let bookAuthorManual = null;

  if (body.bookId) {
    const bookSelection = await db
      .prepare(
        'SELECT 1 FROM org_book_selections WHERE book_id = ? AND organization_id = ? AND is_available = 1'
      )
      .bind(body.bookId, organizationId)
      .first();
    if (bookSelection) {
      bookId = body.bookId;
    } else {
      throw badRequestError("Book not found in this organization's library");
    }
  } else if (body.bookTitleManual) {
    bookTitleManual = String(body.bookTitleManual).slice(0, 500);
    bookAuthorManual = body.bookAuthorManual ? String(body.bookAuthorManual).slice(0, 500) : null;
  }

  const sessionId = generateId();

  const coreWrites = [
    db
      .prepare(
        `INSERT INTO reading_sessions (
           id, student_id, session_date, book_id, book_title_manual, book_author_manual,
           pages_read, duration_minutes, assessment, notes, location, recorded_by
         ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 'home', NULL)`
      )
      .bind(sessionId, studentId, sessionDate, bookId, bookTitleManual, bookAuthorManual),
  ];

  // Update current book if a library book was selected
  if (bookId) {
    coreWrites.push(
      db
        .prepare(
          'UPDATE students SET current_book_id = ?, updated_at = datetime("now") WHERE id = ? AND organization_id = ?'
        )
        .bind(bookId, studentId, organizationId)
    );
  }

  // Update last_read_date
  coreWrites.push(
    db
      .prepare(
        `UPDATE students SET last_read_date = MAX(COALESCE(last_read_date, ''), ?), updated_at = datetime("now")
         WHERE id = ? AND organization_id = ?`
      )
      .bind(sessionDate, studentId, organizationId)
  );

  await db.batch(coreWrites);

  // Side-effects: best-effort (same pattern as teacher session creation)
  try {
    await updateStudentStreak(db, studentId, organizationId, c.env);
  } catch (err) {
    console.error('[parent] streak update failed', { sessionId, studentId, err });
  }

  try {
    await recalculateStats(db, studentId, organizationId);
  } catch (err) {
    console.error('[parent] stats recalc failed', { sessionId, studentId, err });
  }

  let newBadges = [];
  try {
    newBadges = await evaluateRealTime(db, studentId, organizationId, access.year_group);
  } catch (err) {
    console.error('[parent] badge evaluation failed', { sessionId, studentId, err });
  }

  try {
    await updateClassGoalOnSession(db, studentId, organizationId);
  } catch (err) {
    console.error('[parent] class goal update failed', { sessionId, studentId, err });
  }

  // Return updated streak
  const streakRow = await db
    .prepare('SELECT current_streak, streak_last_date FROM reading_stats WHERE student_id = ? AND organization_id = ?')
    .bind(studentId, organizationId)
    .first();

  return c.json(
    {
      id: sessionId,
      date: sessionDate,
      bookTitle: bookTitleManual || null,
      bookId,
      location: 'home',
      streak: { current: streakRow?.current_streak || 0, isActive: true },
      newBadges,
    },
    201
  );
});
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/parent.js
git commit -m "feat(parent): add home reading session creation endpoint"
```

---

### Task 5: API Route — Book Search Endpoint

**Files:**
- Modify: `src/routes/parent.js`

- [ ] **Step 1: Add GET book search endpoint**

Add to `src/routes/parent.js` after the session endpoint:

```javascript
// ---------------------------------------------------------------------------
// Public: GET /api/parent/:token/books?q=... — search books
// ---------------------------------------------------------------------------

parentRouter.get('/:token/books', rateLimit(30), async (c) => {
  const db = requireDB(c.env);
  const { token } = c.req.param();

  const access = await validateParentToken(db, token);
  if (!access) throw notFoundError('Not found');

  const query = (c.req.query('q') || '').trim();
  if (!query || query.length < 2) {
    return c.json({ library: [], external: [] });
  }

  const organizationId = access.organization_id;

  // Search school library via FTS5
  let library = [];
  try {
    const ftsQuery = query
      .replace(/['"*()^]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => `"${t}"*`)
      .join(' ');

    const result = await db
      .prepare(
        `SELECT b.id, b.title, b.author, b.isbn
         FROM books b
         INNER JOIN org_book_selections obs ON b.id = obs.book_id
         INNER JOIN books_fts fts ON b.id = fts.id
         WHERE obs.organization_id = ? AND obs.is_available = 1 AND fts MATCH ?
         ORDER BY rank LIMIT 10`
      )
      .bind(organizationId, ftsQuery)
      .all();

    library = (result.results || []).map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      coverUrl: b.isbn ? `/api/covers/isbn/${b.isbn}` : null,
      source: 'library',
    }));
  } catch {
    // FTS5 may fail on special characters; fall back to LIKE
    const result = await db
      .prepare(
        `SELECT b.id, b.title, b.author, b.isbn
         FROM books b
         INNER JOIN org_book_selections obs ON b.id = obs.book_id
         WHERE obs.organization_id = ? AND obs.is_available = 1
         AND (b.title LIKE ? OR b.author LIKE ?)
         LIMIT 10`
      )
      .bind(organizationId, `%${query}%`, `%${query}%`)
      .all();

    library = (result.results || []).map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      coverUrl: b.isbn ? `/api/covers/isbn/${b.isbn}` : null,
      source: 'library',
    }));
  }

  // Search OpenLibrary for external results
  let external = [];
  try {
    const olRes = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5&fields=title,author_name,first_publish_year,cover_i`
    );
    if (olRes.ok) {
      const olData = await olRes.json();
      external = (olData.docs || []).map((doc) => ({
        title: doc.title,
        author: (doc.author_name || [])[0] || 'Unknown',
        coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
        source: 'external',
      }));
    }
  } catch {
    // External search failure is non-critical
  }

  return c.json({ library, external });
});
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/parent.js
git commit -m "feat(parent): add book search endpoint (library + OpenLibrary)"
```

---

### Task 6: API Route — Teacher Token Generation + Management Endpoints

**Files:**
- Modify: `src/routes/parent.js`

- [ ] **Step 1: Add teacher-facing endpoints**

Add to `src/routes/parent.js` after the book search endpoint:

```javascript
// ---------------------------------------------------------------------------
// Teacher: POST /api/parent/generate/:classId — bulk generate tokens
// ---------------------------------------------------------------------------

parentRouter.post('/generate/:classId', requireTeacher(), async (c) => {
  const db = requireDB(c.env);
  const organizationId = c.get('organizationId');
  const userId = c.get('userId');
  const { classId } = c.req.param();

  // Verify class belongs to org
  const cls = await db
    .prepare('SELECT id FROM classes WHERE id = ? AND organization_id = ?')
    .bind(classId, organizationId)
    .first();
  if (!cls) throw notFoundError('Class not found');

  // Get current academic year
  const now = new Date();
  const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const academicYear = `${startYear}-${startYear + 1}`;

  // Get students in class without active tokens
  const students = await db
    .prepare(
      `SELECT s.id FROM students s
       WHERE s.class_id = ? AND s.organization_id = ? AND s.is_active = 1
       AND s.id NOT IN (
         SELECT student_id FROM parent_access_tokens
         WHERE organization_id = ? AND academic_year = ? AND revoked_at IS NULL
       )`
    )
    .bind(classId, organizationId, organizationId, academicYear)
    .all();

  const newTokens = (students.results || []).map((s) => ({
    id: generateId(),
    token: generateToken(),
    studentId: s.id,
  }));

  // Batch insert (respect 100-statement limit)
  for (let i = 0; i < newTokens.length; i += 50) {
    const batch = newTokens.slice(i, i + 50);
    await db.batch(
      batch.map((t) =>
        db
          .prepare(
            `INSERT INTO parent_access_tokens (id, token, student_id, organization_id, academic_year, created_by)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .bind(t.id, t.token, t.studentId, organizationId, academicYear, userId)
      )
    );
  }

  return c.json({ generated: newTokens.length }, 201);
});

// ---------------------------------------------------------------------------
// Teacher: GET /api/parent/class/:classId — list tokens for print view
// ---------------------------------------------------------------------------

parentRouter.get('/class/:classId', requireTeacher(), async (c) => {
  const db = requireDB(c.env);
  const organizationId = c.get('organizationId');
  const { classId } = c.req.param();

  const now = new Date();
  const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const academicYear = `${startYear}-${startYear + 1}`;

  const result = await db
    .prepare(
      `SELECT pat.id as token_id, pat.token, pat.created_at,
              s.id as student_id, s.name as student_name
       FROM parent_access_tokens pat
       JOIN students s ON pat.student_id = s.id
       WHERE pat.organization_id = ? AND pat.academic_year = ? AND pat.revoked_at IS NULL
       AND s.class_id = ? AND s.is_active = 1
       ORDER BY s.name ASC`
    )
    .bind(organizationId, academicYear, classId)
    .all();

  const tokens = (result.results || []).map((r) => ({
    tokenId: r.token_id,
    token: r.token,
    studentId: r.student_id,
    studentFirstName: (r.student_name || '').split(' ')[0],
    createdAt: r.created_at,
  }));

  return c.json({ tokens, academicYear });
});

// ---------------------------------------------------------------------------
// Teacher: POST /api/parent/generate/student/:studentId — single student token
// ---------------------------------------------------------------------------

parentRouter.post('/generate/student/:studentId', requireTeacher(), async (c) => {
  const db = requireDB(c.env);
  const organizationId = c.get('organizationId');
  const userId = c.get('userId');
  const { studentId } = c.req.param();

  const student = await db
    .prepare('SELECT id FROM students WHERE id = ? AND organization_id = ? AND is_active = 1')
    .bind(studentId, organizationId)
    .first();
  if (!student) throw notFoundError('Student not found');

  const now = new Date();
  const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const academicYear = `${startYear}-${startYear + 1}`;

  // Revoke any existing token for this student/year
  await db
    .prepare(
      `UPDATE parent_access_tokens SET revoked_at = datetime('now')
       WHERE student_id = ? AND organization_id = ? AND academic_year = ? AND revoked_at IS NULL`
    )
    .bind(studentId, organizationId, academicYear)
    .run();

  const tokenId = generateId();
  const token = generateToken();

  await db
    .prepare(
      `INSERT INTO parent_access_tokens (id, token, student_id, organization_id, academic_year, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(tokenId, token, studentId, organizationId, academicYear, userId)
    .run();

  return c.json({ tokenId, token }, 201);
});

// ---------------------------------------------------------------------------
// Teacher: DELETE /api/parent/tokens/:tokenId — revoke a token
// ---------------------------------------------------------------------------

parentRouter.delete('/tokens/:tokenId', requireTeacher(), async (c) => {
  const db = requireDB(c.env);
  const organizationId = c.get('organizationId');
  const { tokenId } = c.req.param();

  const result = await db
    .prepare(
      `UPDATE parent_access_tokens SET revoked_at = datetime('now')
       WHERE id = ? AND organization_id = ? AND revoked_at IS NULL`
    )
    .bind(tokenId, organizationId)
    .run();

  if (result.meta.changes === 0) throw notFoundError('Token not found');

  return c.json({ revoked: true });
});
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/parent.js
git commit -m "feat(parent): add teacher token generation and management endpoints"
```

---

### Task 7: Install qrcode.react + QR Code Print Sheet Component

**Files:**
- Modify: `package.json` (via npm install)
- Create: `src/components/parent/QRCodeSheet.js`

- [ ] **Step 1: Install qrcode.react**

Run: `npm install qrcode.react`

- [ ] **Step 2: Create QRCodeSheet component**

Create `src/components/parent/QRCodeSheet.js`:

```javascript
import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Button, CircularProgress, Alert } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../contexts/AuthContext';
import TallyLogo from '../TallyLogo';

const APP_URL = window.location.origin;

export default function QRCodeSheet({ classId, className, onClose }) {
  const { fetchWithAuth } = useAuth();
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadTokens = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Generate tokens for any students who don't have one
      await fetchWithAuth(`/api/parent/generate/${classId}`, { method: 'POST' });
      // Fetch all tokens for the class
      const res = await fetchWithAuth(`/api/parent/class/${classId}`);
      const data = await res.json();
      setTokens(data.tokens || []);
    } catch (err) {
      setError(err.message || 'Failed to load QR codes');
    } finally {
      setLoading(false);
    }
  }, [classId, fetchWithAuth]);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
  }

  if (tokens.length === 0) {
    return (
      <Alert severity="info" sx={{ m: 2 }}>
        No active students in this class.
      </Alert>
    );
  }

  return (
    <Box>
      {/* Print controls — hidden when printing */}
      <Box
        className="no-print"
        sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, px: 2 }}
      >
        <Typography variant="h6" sx={{ flex: 1, fontWeight: 600, color: '#3D3427' }}>
          Parent QR Codes — {className}
        </Typography>
        {onClose && (
          <Button onClick={onClose} size="small">
            Close
          </Button>
        )}
        <Button variant="contained" startIcon={<PrintIcon />} onClick={handlePrint}>
          Print
        </Button>
      </Box>

      {/* QR code grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 2,
          px: 2,
          '@media print': {
            gap: 0,
            px: 0,
          },
        }}
      >
        {tokens.map((t) => (
          <Box
            key={t.tokenId}
            sx={{
              border: '2px dashed #c5cfc0',
              borderRadius: 3,
              p: 2,
              textAlign: 'center',
              background: '#faf8f5',
              '@media print': {
                borderRadius: 0,
                breakInside: 'avoid',
                p: 1.5,
              },
            }}
          >
            <QRCodeSVG
              value={`${APP_URL}/parent/${t.token}`}
              size={100}
              level="M"
              style={{ margin: '0 auto' }}
            />
            <Typography
              sx={{ mt: 1, fontWeight: 600, color: '#2d5016', fontSize: 16 }}
            >
              {t.studentFirstName}
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
              <TallyLogo size={14} color="#8b7d6b" />
              <Typography sx={{ fontSize: 10, color: '#8b7d6b' }}>
                Tally Reading
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>

      {/* Print-only styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; }
          @page { margin: 1cm; }
        }
      `}</style>
    </Box>
  );
}
```

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/parent/QRCodeSheet.js
git commit -m "feat(parent): add QR code print sheet component"
```

---

### Task 8: Teacher Access Points — Class Manager + Student List + Student Drawer

**Files:**
- Create: `src/components/parent/ParentQRButton.js`
- Modify: `src/components/classes/ClassManager.js`
- Modify: `src/components/students/StudentList.js`
- Modify: `src/components/students/StudentDetailDrawer.js`

- [ ] **Step 1: Create ParentQRButton shared component**

This component handles both the toolbar button and the single-student QR dialog.

Create `src/components/parent/ParentQRButton.js`:

```javascript
import React, { useState } from 'react';
import {
  Button, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Tooltip, CircularProgress,
} from '@mui/material';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import PrintIcon from '@mui/icons-material/Print';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../contexts/AuthContext';
import TallyLogo from '../TallyLogo';

const APP_URL = window.location.origin;

export default function ParentQRButton({ studentId, studentName, variant = 'icon' }) {
  const { fetchWithAuth } = useAuth();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const firstName = (studentName || '').split(' ')[0];

  const loadOrGenerate = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/parent/generate/student/${studentId}`, {
        method: 'POST',
      });
      const data = await res.json();
      setToken(data.token);
    } catch {
      // Ignore — loading state handles UI
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    loadOrGenerate();
  };

  const handleCopy = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(`${APP_URL}/parent/${token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => window.print();

  const handleRegenerate = () => {
    setToken(null);
    loadOrGenerate();
  };

  const trigger =
    variant === 'button' ? (
      <Button
        size="small"
        startIcon={<QrCode2Icon />}
        onClick={handleOpen}
        sx={{ color: '#2d5016' }}
      >
        Parent QR
      </Button>
    ) : (
      <Tooltip title="Parent QR Code">
        <IconButton size="small" onClick={handleOpen} sx={{ color: '#2d5016' }}>
          <QrCode2Icon fontSize="small" />
        </IconButton>
      </Tooltip>
    );

  return (
    <>
      {trigger}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600, color: '#3D3427' }}>
          Parent QR Code — {firstName}
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center', py: 3 }}>
          {loading ? (
            <CircularProgress />
          ) : token ? (
            <Box>
              <QRCodeSVG
                value={`${APP_URL}/parent/${token}`}
                size={180}
                level="M"
                style={{ margin: '0 auto' }}
              />
              <Typography sx={{ mt: 2, fontWeight: 600, color: '#2d5016', fontSize: 18 }}>
                {firstName}
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5, mt: 0.5 }}>
                <TallyLogo size={14} color="#8b7d6b" />
                <Typography sx={{ fontSize: 11, color: '#8b7d6b' }}>Tally Reading</Typography>
              </Box>
            </Box>
          ) : (
            <Typography color="error">Failed to generate QR code</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', gap: 1, pb: 2 }}>
          <Button startIcon={<PrintIcon />} onClick={handlePrint} disabled={!token}>
            Print
          </Button>
          <Button
            startIcon={<ContentCopyIcon />}
            onClick={handleCopy}
            disabled={!token}
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>
          <Button startIcon={<RefreshIcon />} onClick={handleRegenerate} color="warning">
            Regenerate
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Add QR button to ClassManager**

In `src/components/classes/ClassManager.js`:

Add import:
```javascript
import QrCode2Icon from '@mui/icons-material/QrCode2';
import QRCodeSheet from '../parent/QRCodeSheet.js';
```

Add state near the other `useState` declarations:
```javascript
const [qrClass, setQrClass] = useState(null);
```

In the class row's `secondaryAction` Box (around line 340), add a new IconButton before the Edit button:

```javascript
<Tooltip title="Parent QR Codes">
  <IconButton
    edge="end"
    aria-label="parent qr codes"
    onClick={() => setQrClass(cls)}
    sx={{ color: '#2d5016' }}
  >
    <QrCode2Icon />
  </IconButton>
</Tooltip>
```

Add the QRCodeSheet dialog at the end of the component's return, before the final closing tags:

```javascript
<Dialog open={!!qrClass} onClose={() => setQrClass(null)} maxWidth="md" fullWidth>
  <DialogContent>
    {qrClass && (
      <QRCodeSheet
        classId={qrClass.id}
        className={qrClass.name}
        onClose={() => setQrClass(null)}
      />
    )}
  </DialogContent>
</Dialog>
```

Add the necessary imports for `Dialog`, `DialogContent`, and `Tooltip` if not already present.

- [ ] **Step 3: Add QR button to StudentDetailDrawer**

In `src/components/students/StudentDetailDrawer.js`, add the ParentQRButton import:

```javascript
import ParentQRButton from '../parent/ParentQRButton.js';
```

In the student detail actions area (where edit/delete buttons are), add:

```javascript
<ParentQRButton studentId={student.id} studentName={student.name} variant="button" />
```

- [ ] **Step 4: Add QR button to StudentList toolbar**

In `src/components/students/StudentList.js`, add a button in the toolbar area. Import and add:

```javascript
import QrCode2Icon from '@mui/icons-material/QrCode2';
import QRCodeSheet from '../parent/QRCodeSheet.js';
```

Add state:
```javascript
const [showQRSheet, setShowQRSheet] = useState(false);
```

Add button in the toolbar (near existing action buttons):
```javascript
<Tooltip title="Parent QR Codes">
  <IconButton onClick={() => setShowQRSheet(true)} sx={{ color: '#2d5016' }}>
    <QrCode2Icon />
  </IconButton>
</Tooltip>
```

Add the dialog:
```javascript
<Dialog open={showQRSheet} onClose={() => setShowQRSheet(false)} maxWidth="md" fullWidth>
  <DialogContent>
    {showQRSheet && selectedClass && (
      <QRCodeSheet
        classId={selectedClass}
        className={classes.find((c) => c.id === selectedClass)?.name || 'Class'}
        onClose={() => setShowQRSheet(false)}
      />
    )}
    {showQRSheet && !selectedClass && (
      <Alert severity="info">Select a class filter first to generate QR codes.</Alert>
    )}
  </DialogContent>
</Dialog>
```

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/parent/ParentQRButton.js src/components/classes/ClassManager.js src/components/students/StudentDetailDrawer.js src/components/students/StudentList.js
git commit -m "feat(parent): add QR code buttons to class manager, student list, and student drawer"
```

---

### Task 9: Frontend — Parent Portal SPA Route + App.js Bypass

**Files:**
- Create: `src/components/parent/ParentPortal.js`
- Modify: `src/App.js`

- [ ] **Step 1: Create ParentPortal component**

Create `src/components/parent/ParentPortal.js`:

```javascript
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, CircularProgress, Alert, Chip, Button,
  Dialog, DialogContent, TextField, InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import BookCover from '../BookCover';
import StreakBadge from '../students/StreakBadge';
import GardenHeader from '../badges/GardenHeader';
import BadgeCelebration from '../badges/BadgeCelebration';
import TallyLogo from '../TallyLogo';

const API_BASE = '/api/parent';

function getDateChips() {
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  return [
    { label: 'Today', value: today.toISOString().split('T')[0] },
    { label: 'Yesterday', value: yesterday.toISOString().split('T')[0] },
  ];
}

export default function ParentPortal() {
  const token = window.location.pathname.split('/parent/')[1];

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Session logging state
  const [showLogSheet, setShowLogSheet] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getDateChips()[0].value);
  const [customDate, setCustomDate] = useState('');
  const [selectedBook, setSelectedBook] = useState(null);
  const [logging, setLogging] = useState(false);
  const [logSuccess, setLogSuccess] = useState(null);
  const [logError, setLogError] = useState(null);
  const [newBadges, setNewBadges] = useState([]);

  // Book search state
  const [showBookSearch, setShowBookSearch] = useState(false);
  const [bookQuery, setBookQuery] = useState('');
  const [bookResults, setBookResults] = useState({ library: [], external: [] });
  const [searchingBooks, setSearchingBooks] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/${token}`);
      if (!res.ok) {
        setError(res.status === 404 ? 'This link is no longer active.' : 'Something went wrong.');
        return;
      }
      const json = await res.json();
      setData(json);
      setSelectedBook(json.currentBook);
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Book search with debounce
  useEffect(() => {
    if (!bookQuery || bookQuery.length < 2) {
      setBookResults({ library: [], external: [] });
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingBooks(true);
      try {
        const res = await fetch(`${API_BASE}/${token}/books?q=${encodeURIComponent(bookQuery)}`);
        if (res.ok) setBookResults(await res.json());
      } catch {
        // Non-critical
      } finally {
        setSearchingBooks(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [bookQuery, token]);

  const handleLogReading = async () => {
    setLogging(true);
    setLogError(null);
    const date = selectedDate === 'custom' ? customDate : selectedDate;
    const body = { sessionDate: date };
    if (selectedBook?.id) {
      body.bookId = selectedBook.id;
    } else if (selectedBook?.title) {
      body.bookTitleManual = selectedBook.title;
      body.bookAuthorManual = selectedBook.author;
    }
    try {
      const res = await fetch(`${API_BASE}/${token}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setLogError(json.error || 'Failed to log reading');
        setLogging(false);
        return;
      }
      setLogSuccess(json);
      if (json.newBadges?.length) setNewBadges(json.newBadges);
      setTimeout(() => {
        setShowLogSheet(false);
        setLogSuccess(null);
        fetchData();
      }, 2500);
    } catch {
      setLogError('Unable to connect. Please try again.');
    } finally {
      setLogging(false);
    }
  };

  const handleSelectBook = (book) => {
    setSelectedBook(book);
    setShowBookSearch(false);
    setBookQuery('');
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#faf8f5' }}>
        <CircularProgress sx={{ color: '#4a7c28' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#faf8f5', p: 3 }}>
        <TallyLogo size={48} color="#2d5016" />
        <Typography sx={{ mt: 2, color: '#666', textAlign: 'center' }}>{error}</Typography>
      </Box>
    );
  }

  const dateChips = getDateChips();

  return (
    <Box sx={{ minHeight: '100vh', background: '#faf8f5', maxWidth: 480, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ background: 'linear-gradient(135deg, #2d5016, #4a7c28)', px: 2.5, py: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <TallyLogo size={28} color="#faf8f5" />
        <Typography sx={{ color: '#faf8f5', fontWeight: 600, fontSize: 16 }}>Tally Reading</Typography>
      </Box>

      <Box sx={{ px: 2.5, pt: 2.5 }}>
        {/* Student name */}
        <Typography sx={{ fontSize: 22, fontWeight: 700, color: '#2d5016' }}>
          {data.studentFirstName}&apos;s Reading
        </Typography>

        {/* Current book */}
        {data.currentBook && (
          <Paper
            onClick={() => setShowBookSearch(true)}
            sx={{
              mt: 2, display: 'flex', gap: 2, p: 2, borderRadius: 3,
              cursor: 'pointer', '&:hover': { boxShadow: 3 },
              transition: 'box-shadow 0.2s',
            }}
            elevation={1}
          >
            <BookCover book={data.currentBook} width={56} height={80} />
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography sx={{ fontSize: 11, color: '#8b7d6b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Currently reading
              </Typography>
              <Typography sx={{ fontWeight: 600, fontSize: 15, color: '#333' }}>
                {data.currentBook.title}
              </Typography>
              <Typography sx={{ color: '#666', fontSize: 13 }}>
                {data.currentBook.author}
              </Typography>
            </Box>
          </Paper>
        )}

        {/* Streak + Read Today */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 2 }}>
          <StreakBadge streak={data.streak.current} size="medium" showLabel />
          <Box sx={{ flex: 1 }} />
          <Button
            variant="contained"
            onClick={() => setShowLogSheet(true)}
            sx={{
              borderRadius: 6, px: 3, py: 1.2, fontWeight: 600, fontSize: 14,
              background: 'linear-gradient(135deg, #2d5016, #4a7c28)',
              boxShadow: '0 3px 12px rgba(45,80,22,0.3)',
              textTransform: 'none',
            }}
          >
            ✓ Read Today
          </Button>
        </Box>

        {/* Session history */}
        <Typography sx={{ fontWeight: 600, color: '#555', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, mt: 3, mb: 1.5 }}>
          Recent Sessions
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {data.sessions.map((s, i) => (
            <Box
              key={i}
              sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 1.2, background: '#fff', borderRadius: 2.5, gap: 1.2 }}
            >
              <Box sx={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: s.location === 'home' ? '#7c5ab8' : '#4a7c28',
              }} />
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 500, color: '#333' }}>{s.bookTitle}</Typography>
                <Typography sx={{ fontSize: 11, color: '#999' }}>
                  {new Date(s.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </Typography>
              </Box>
              <Chip
                label={s.location === 'home' ? 'Home' : 'School'}
                size="small"
                sx={{
                  fontSize: 11, height: 22,
                  backgroundColor: s.location === 'home' ? '#f3eef9' : '#f0ebe3',
                  color: s.location === 'home' ? '#7c5ab8' : '#8b7d6b',
                }}
              />
            </Box>
          ))}
          {data.sessions.length === 0 && (
            <Typography sx={{ color: '#999', fontSize: 13, textAlign: 'center', py: 2 }}>
              No reading sessions yet.
            </Typography>
          )}
        </Box>

        {/* Reading Garden */}
        <Box sx={{ mt: 3, mb: 3 }}>
          <Typography sx={{ fontWeight: 600, color: '#555', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, mb: 1.5 }}>
            Reading Garden
          </Typography>
          <GardenHeader badgeCount={data.badgeCount} height={120} />
        </Box>
      </Box>

      {/* Log Reading Bottom Sheet */}
      <Dialog
        open={showLogSheet}
        onClose={() => { setShowLogSheet(false); setLogSuccess(null); setLogError(null); }}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: { position: 'fixed', bottom: 0, m: 0, borderRadius: '20px 20px 0 0', maxHeight: '80vh' },
        }}
      >
        <DialogContent sx={{ pt: 3 }}>
          {logSuccess ? (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Typography sx={{ fontSize: 56 }}>🎉</Typography>
              <Typography sx={{ fontSize: 22, fontWeight: 700, color: '#2d5016', mt: 1 }}>
                Reading logged!
              </Typography>
              <Typography sx={{ color: '#666', mt: 0.5 }}>
                {logSuccess.bookTitle || data.currentBook?.title} — {new Date(logSuccess.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </Typography>
              {logSuccess.streak && (
                <Box sx={{ mt: 2 }}>
                  <StreakBadge streak={logSuccess.streak.current} size="large" showLabel />
                </Box>
              )}
            </Box>
          ) : (
            <Box>
              <Typography sx={{ fontSize: 18, fontWeight: 700, color: '#2d5016', mb: 2 }}>
                Log Reading
              </Typography>

              {/* Date selector */}
              <Typography sx={{ fontSize: 11, color: '#8b7d6b', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.75 }}>
                When
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                {dateChips.map((chip) => (
                  <Chip
                    key={chip.value}
                    label={chip.label}
                    onClick={() => setSelectedDate(chip.value)}
                    sx={{
                      fontWeight: selectedDate === chip.value ? 600 : 400,
                      backgroundColor: selectedDate === chip.value ? '#e8f5e1' : '#f5f2ed',
                      border: selectedDate === chip.value ? '2px solid #4a7c28' : '2px solid transparent',
                      color: selectedDate === chip.value ? '#2d5016' : '#666',
                    }}
                  />
                ))}
                <Chip
                  label="Pick date…"
                  onClick={() => setSelectedDate('custom')}
                  sx={{
                    fontWeight: selectedDate === 'custom' ? 600 : 400,
                    backgroundColor: selectedDate === 'custom' ? '#e8f5e1' : '#f5f2ed',
                    border: selectedDate === 'custom' ? '2px solid #4a7c28' : '2px solid transparent',
                    color: selectedDate === 'custom' ? '#2d5016' : '#666',
                  }}
                />
              </Box>
              {selectedDate === 'custom' && (
                <TextField
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  inputProps={{ max: new Date().toISOString().split('T')[0] }}
                  size="small"
                  fullWidth
                  sx={{ mb: 2 }}
                />
              )}

              {/* Book */}
              <Typography sx={{ fontSize: 11, color: '#8b7d6b', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.75 }}>
                Book
              </Typography>
              <Paper
                onClick={() => setShowBookSearch(true)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 2.5,
                  cursor: 'pointer', mb: 2.5, border: '1px solid #e8e0d4',
                }}
                elevation={0}
              >
                {selectedBook ? (
                  <>
                    <BookCover book={selectedBook} width={36} height={50} />
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 600, fontSize: 14, color: '#333' }}>
                        {selectedBook.title}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: '#888' }}>
                        {selectedBook.author}
                      </Typography>
                    </Box>
                  </>
                ) : (
                  <Typography sx={{ color: '#999', fontSize: 14, py: 1 }}>
                    Tap to select a book
                  </Typography>
                )}
                <Typography sx={{ fontSize: 12, color: '#4a7c28', fontWeight: 500 }}>
                  Change
                </Typography>
              </Paper>

              {logError && <Alert severity="error" sx={{ mb: 2 }}>{logError}</Alert>}

              <Button
                fullWidth
                variant="contained"
                onClick={handleLogReading}
                disabled={logging || (selectedDate === 'custom' && !customDate)}
                sx={{
                  borderRadius: 3.5, py: 1.5, fontWeight: 600, fontSize: 15,
                  background: 'linear-gradient(135deg, #2d5016, #4a7c28)',
                  boxShadow: '0 3px 12px rgba(45,80,22,0.3)',
                  textTransform: 'none',
                }}
              >
                {logging ? <CircularProgress size={24} sx={{ color: '#fff' }} /> : '✓ Log Reading'}
              </Button>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Book Search Dialog */}
      <Dialog
        open={showBookSearch}
        onClose={() => { setShowBookSearch(false); setBookQuery(''); }}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: { position: 'fixed', bottom: 0, top: 60, m: 0, borderRadius: '20px 20px 0 0' },
        }}
      >
        <DialogContent>
          <Typography sx={{ fontSize: 18, fontWeight: 700, color: '#2d5016', mb: 2 }}>
            Change Book
          </Typography>
          <TextField
            fullWidth
            placeholder="Search books…"
            value={bookQuery}
            onChange={(e) => setBookQuery(e.target.value)}
            autoFocus
            size="small"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#999' }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ mb: 2 }}
          />
          {searchingBooks && <CircularProgress size={20} sx={{ display: 'block', mx: 'auto', mb: 2 }} />}

          {bookResults.library.length > 0 && (
            <>
              <Typography sx={{ fontSize: 11, color: '#8b7d6b', textTransform: 'uppercase', letterSpacing: 0.5, mb: 1 }}>
                School Library
              </Typography>
              {bookResults.library.map((b) => (
                <Paper
                  key={b.id}
                  onClick={() => handleSelectBook(b)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.2, p: 1.2, mb: 0.75,
                    borderRadius: 2, cursor: 'pointer', border: '1px solid #e8e0d4',
                    '&:hover': { backgroundColor: '#f5f2ed' },
                  }}
                  elevation={0}
                >
                  <BookCover book={b} width={32} height={44} />
                  <Box>
                    <Typography sx={{ fontWeight: 500, fontSize: 13, color: '#333' }}>{b.title}</Typography>
                    <Typography sx={{ fontSize: 11, color: '#888' }}>{b.author}</Typography>
                  </Box>
                </Paper>
              ))}
            </>
          )}

          {bookResults.external.length > 0 && (
            <>
              <Typography sx={{ fontSize: 11, color: '#8b7d6b', textTransform: 'uppercase', letterSpacing: 0.5, mb: 1, mt: 2 }}>
                Other Books
              </Typography>
              {bookResults.external.map((b, i) => (
                <Paper
                  key={i}
                  onClick={() => handleSelectBook({ title: b.title, author: b.author, source: 'external' })}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.2, p: 1.2, mb: 0.75,
                    borderRadius: 2, cursor: 'pointer', border: '1px solid #eee',
                    '&:hover': { backgroundColor: '#f9f9f9' },
                  }}
                  elevation={0}
                >
                  <Box sx={{ width: 32, height: 44, backgroundColor: '#e8e0d4', borderRadius: 0.5, flexShrink: 0 }} />
                  <Box>
                    <Typography sx={{ fontWeight: 500, fontSize: 13, color: '#333' }}>{b.title}</Typography>
                    <Typography sx={{ fontSize: 11, color: '#888' }}>{b.author}</Typography>
                  </Box>
                </Paper>
              ))}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Badge Celebration */}
      <BadgeCelebration badges={newBadges} onClose={() => setNewBadges([])} />
    </Box>
  );
}
```

- [ ] **Step 2: Add parent route bypass in App.js**

In `src/App.js`, add a lazy import at the top with the other standalone pages:

```javascript
const ParentPortal = React.lazy(() => import('./components/parent/ParentPortal'));
```

Add the route bypass before the `if (!isAuthenticated)` check (around line 211), after the `/help` block:

```javascript
if (window.location.pathname.startsWith('/parent/')) {
  return (
    <Suspense fallback={<PageFallback />}>
      <ParentPortal />
    </Suspense>
  );
}
```

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/parent/ParentPortal.js src/App.js
git commit -m "feat(parent): add parent portal SPA route and main component"
```

---

### Task 10: Build Verification + Manual Testing

**Files:** None (testing only)

- [ ] **Step 1: Run all unit tests**

Run: `npm test`
Expected: All tests pass, including the new parentTokens tests.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 3: Build the project**

Run: `npm run build`
Expected: Build completes successfully with no errors.

- [ ] **Step 4: Start dev environment**

Run: `npm run start:dev`

Test the following:
1. Log in as `dev@tallyreading.uk` / `password`
2. Navigate to Class Manager — verify "Parent QR Codes" button appears on class rows
3. Click the QR button — verify tokens are generated and QR codes render
4. Click Print — verify print layout looks correct
5. Open a student detail drawer — verify "Parent QR" button appears
6. Copy a parent portal link and open it in an incognito window
7. Verify the parent view loads with student first name, current book, streak, sessions, garden
8. Tap "Read Today" — verify the bottom sheet slides up
9. Log a reading session — verify success and streak update
10. Refresh — verify the new session appears in the history tagged as "Home"

- [ ] **Step 5: Commit any fixes**

If any issues found during testing, fix and commit:
```bash
git add -A
git commit -m "fix(parent): address issues found during manual testing"
```

---

### Task 11: Update CLAUDE.md File Map

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add new files to the file map**

In `CLAUDE.md`, add entries for the new files in their appropriate sections:

In the routes section:
```
src/routes/parent.js - Parent portal: token validation, parent view, home session logging, book search, teacher token generation/management
```

In the components section:
```
src/components/parent/ParentPortal.js - Parent portal main view (mobile-first: book, streak, sessions, garden, session logging, book search)
src/components/parent/QRCodeSheet.js - Printable QR code grid (3×4 per A4) for class parent links
src/components/parent/ParentQRButton.js - Shared QR code button + single-student QR dialog
```

In the key tables section, add:
```
- `parent_access_tokens` - QR-code parent portal access (token per student per academic year, teacher-revocable)
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add parent portal files to CLAUDE.md file map"
```
