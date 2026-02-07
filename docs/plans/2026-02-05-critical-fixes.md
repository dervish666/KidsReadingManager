# Critical Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the top 10 priority issues from the codebase security and quality audit.

**Architecture:** Surgical fixes across backend middleware, crypto utils, auth routes, data provider, frontend context, and App shell. Each fix is independent and well-contained.

**Tech Stack:** Hono (Cloudflare Workers), React 19, D1 database, Vitest

---

### Task 1: Add Error Boundary to App.js

**Files:**
- Create: `src/components/ErrorBoundary.js`
- Modify: `src/App.js`

**Step 1: Create ErrorBoundary component**

Create `src/components/ErrorBoundary.js`:

```jsx
import React from 'react';
import { Box, Typography, Button } from '@mui/material';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', p: 3, textAlign: 'center' }}>
          <Typography variant="h5" gutterBottom>Something went wrong</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            An unexpected error occurred. Please try refreshing the page.
          </Typography>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Refresh Page
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
```

**Step 2: Wrap App with ErrorBoundary**

In `src/App.js`, add import at top:
```javascript
import ErrorBoundary from './components/ErrorBoundary';
```

Then wrap the App function's return:
```jsx
function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AppProvider>
          <BookCoverProvider>
            <AppContent />
          </BookCoverProvider>
        </AppProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
```

**Step 3: Run tests**

Run: `npm test`
Expected: All existing tests pass (ErrorBoundary is additive, breaks nothing)

**Step 4: Commit**

```bash
git add src/components/ErrorBoundary.js src/App.js
git commit -m "fix: add Error Boundary to prevent white-screen crashes"
```

---

### Task 2: Fix timing attacks in legacy auth and refresh token verification

**Files:**
- Modify: `src/utils/crypto.js:298` (export constantTimeEqual, add string version)
- Modify: `src/middleware/auth.js:79,126` (use constant-time comparison)

**Step 1: Export constantTimeEqual and add string helper**

In `src/utils/crypto.js`, change `constantTimeEqual` from a private function to an exported one, and add a string comparison helper:

Change line 298 from:
```javascript
function constantTimeEqual(a, b) {
```
to:
```javascript
export function constantTimeEqual(a, b) {
```

Then add after the `constantTimeEqual` function (after line 306):
```javascript
/**
 * Constant-time string comparison (converts to bytes first)
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} - True if equal
 */
export function constantTimeStringEqual(a, b) {
  const encoder = new TextEncoder();
  return constantTimeEqual(encoder.encode(a), encoder.encode(b));
}
```

**Step 2: Fix legacy auth signature comparison**

In `src/middleware/auth.js`, add import at top:
```javascript
import { constantTimeStringEqual } from '../utils/crypto.js';
```

Change line 79 from:
```javascript
  return expected === sig;
```
to:
```javascript
  return constantTimeStringEqual(expected, sig);
```

Change line 126 from:
```javascript
  if (!password || password !== env.WORKER_ADMIN_PASSWORD) {
```
to:
```javascript
  if (!password || !constantTimeStringEqual(password, env.WORKER_ADMIN_PASSWORD)) {
```

**Step 3: Fix refresh token verification**

In `src/utils/crypto.js`, change `verifyRefreshToken` (lines 218-221) from:
```javascript
export async function verifyRefreshToken(token, storedHash) {
  const computedHash = await hashToken(token);
  return computedHash === storedHash;
}
```
to:
```javascript
export async function verifyRefreshToken(token, storedHash) {
  const computedHash = await hashToken(token);
  return constantTimeStringEqual(computedHash, storedHash);
}
```

**Step 4: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/utils/crypto.js src/middleware/auth.js
git commit -m "fix: use constant-time comparison for auth token and password verification"
```

---

### Task 3: Remove refresh token from JSON response body and localStorage

**Files:**
- Modify: `src/routes/auth.js` (3 places: register, login, refresh responses)
- Modify: `src/contexts/AppContext.js` (remove all REFRESH_TOKEN_KEY localStorage usage)

**Step 1: Remove refreshToken from server JSON responses**

In `src/routes/auth.js`:

**Register response** (~line 183-199): Remove the `refreshToken` line from the response JSON. Change:
```javascript
    return c.json({
      message: 'Registration successful',
      accessToken,
      // Still include refresh token for backward compatibility
      refreshToken: refreshTokenData.token,
      user: {
```
to:
```javascript
    return c.json({
      message: 'Registration successful',
      accessToken,
      user: {
```

**Login response** (~line 397-413): Remove the refreshToken line. Change:
```javascript
    return c.json({
      accessToken,
      // Still include refresh token in response for backward compatibility
      // Frontend should migrate to using cookies instead
      refreshToken: refreshTokenData.token,
      user: {
```
to:
```javascript
    return c.json({
      accessToken,
      user: {
```

**Refresh response** (~line 538-553): Remove the refreshToken line. Change:
```javascript
    return c.json({
      accessToken,
      // Still include refresh token in response for backward compatibility
      refreshToken: newRefreshTokenData.token,
      user: {
```
to:
```javascript
    return c.json({
      accessToken,
      user: {
```

**Step 2: Remove refreshToken localStorage from frontend**

In `src/contexts/AppContext.js`:

Remove the `REFRESH_TOKEN_KEY` constant (line 18) and the `refreshToken` state (lines 76-83). Remove all localStorage operations that reference `REFRESH_TOKEN_KEY` (lines 249, 400, 460). Remove `setRefreshToken` calls (lines 257, 411, 471).

Specifically:

1. Remove line 18: `const REFRESH_TOKEN_KEY = 'krm_refresh_token';`

2. Replace the refreshToken state (lines 76-83) with a simple null:
```javascript
  // Refresh token now handled exclusively via httpOnly cookie
  const [refreshToken] = useState(null);
```

3. In `clearAuthState` (~line 249), remove:
```javascript
        window.localStorage.removeItem(REFRESH_TOKEN_KEY);
```

4. In the login callback (~lines 399-401), remove:
```javascript
            if (data.refreshToken) {
              window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
            }
```

5. In the register callback (~lines 459-461), remove:
```javascript
            if (data.refreshToken) {
              window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
            }
```

6. Remove `setRefreshToken(data.refreshToken || null);` from login (~line 411) and register (~line 471). Remove `setRefreshToken(null);` from clearAuthState (~line 257).

7. In `refreshAccessToken` (~line 211), change the body to not send refreshToken:
```javascript
        body: JSON.stringify({}),
```

**Step 3: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/routes/auth.js src/contexts/AppContext.js
git commit -m "fix: stop exposing refresh token in JSON responses, rely on httpOnly cookie only"
```

---

### Task 4: Fix FTS5 content_rowid mismatch

**Files:**
- Create: `migrations/0019_fix_fts5_rowid.sql`

**Step 1: Create migration to rebuild FTS5 without content_rowid**

The issue: `content_rowid='rowid'` assumes an integer rowid, but `books` uses a TEXT primary key. The FTS5 table should not use content-sync mode since the rowid doesn't correspond to the TEXT id.

Create `migrations/0019_fix_fts5_rowid.sql`:

```sql
-- Fix: FTS5 content_rowid='rowid' is incompatible with TEXT primary key
-- Rebuild FTS5 as a standalone (non-content-sync) table
-- The existing triggers already handle manual sync, so content-sync mode is not needed

-- Drop existing triggers (they reference the old FTS table)
DROP TRIGGER IF EXISTS books_ai;
DROP TRIGGER IF EXISTS books_ad;
DROP TRIGGER IF EXISTS books_au;

-- Drop old FTS table
DROP TABLE IF EXISTS books_fts;

-- Create new FTS5 table WITHOUT content sync (standalone)
CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5(
    id,
    title,
    author
);

-- Populate FTS from existing books data
INSERT INTO books_fts(id, title, author)
SELECT id, title, author FROM books;

-- Recreate triggers for the standalone FTS table
CREATE TRIGGER IF NOT EXISTS books_ai AFTER INSERT ON books BEGIN
    INSERT INTO books_fts(id, title, author) VALUES (new.id, new.title, new.author);
END;

CREATE TRIGGER IF NOT EXISTS books_ad AFTER DELETE ON books BEGIN
    DELETE FROM books_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS books_au AFTER UPDATE ON books BEGIN
    DELETE FROM books_fts WHERE id = old.id;
    INSERT INTO books_fts(id, title, author) VALUES (new.id, new.title, new.author);
END;
```

Note: The delete trigger changes from the content-sync `INSERT INTO books_fts(books_fts, ...) VALUES('delete', ...)` command to a simple `DELETE FROM books_fts WHERE id = old.id`, which is the correct approach for standalone FTS5 tables.

**Step 2: Test locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`
Expected: Migration applies successfully

**Step 3: Commit**

```bash
git add migrations/0019_fix_fts5_rowid.sql
git commit -m "fix: rebuild FTS5 as standalone table to fix TEXT primary key incompatibility"
```

---

### Task 5: Add error reporting to batch operations

**Files:**
- Modify: `src/data/d1Provider.js:270-274,319-323`

**Step 1: Add batch tracking with error context**

In `src/data/d1Provider.js`, replace the batch loop in `addBooksBatch` (lines 270-274):

From:
```javascript
    const BATCH_SIZE = 100;
    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      const batch = statements.slice(i, i + BATCH_SIZE);
      await db.batch(batch);
    }
```

To:
```javascript
    const BATCH_SIZE = 100;
    let completedCount = 0;
    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      const batch = statements.slice(i, i + BATCH_SIZE);
      try {
        await db.batch(batch);
        completedCount += batch.length;
      } catch (batchError) {
        console.error(`Batch insert failed at items ${i}-${i + batch.length} of ${statements.length}. ${completedCount} items were committed before failure.`);
        throw new Error(`Batch insert failed after ${completedCount}/${statements.length} items: ${batchError.message}`);
      }
    }
```

Apply the same pattern to `updateBooksBatch` (lines 319-323):

From:
```javascript
    const BATCH_SIZE = 100;
    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      const batch = statements.slice(i, i + BATCH_SIZE);
      await db.batch(batch);
    }
```

To:
```javascript
    const BATCH_SIZE = 100;
    let completedCount = 0;
    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      const batch = statements.slice(i, i + BATCH_SIZE);
      try {
        await db.batch(batch);
        completedCount += batch.length;
      } catch (batchError) {
        console.error(`Batch update failed at items ${i}-${i + batch.length} of ${statements.length}. ${completedCount} items were committed before failure.`);
        throw new Error(`Batch update failed after ${completedCount}/${statements.length} items: ${batchError.message}`);
      }
    }
```

**Step 2: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/data/d1Provider.js
git commit -m "fix: add error tracking to batch operations, report partial failure state"
```

---

### Task 6: Require APP_URL for password reset emails

**Files:**
- Modify: `src/routes/auth.js:657-661`

**Step 1: Replace header fallback with APP_URL requirement**

In `src/routes/auth.js`, replace lines 657-668:

From:
```javascript
    // Send password reset email
    // Determine base URL from request or environment
    const baseUrl = c.env.APP_URL ||
                    c.req.header('origin') ||
                    `https://${c.req.header('host')}`;

    const emailResult = await sendPasswordResetEmail(
      c.env,
      user.email,
      user.name,
      resetToken,
      baseUrl
    );
```

To:
```javascript
    // Send password reset email
    const baseUrl = c.env.APP_URL;
    if (!baseUrl) {
      console.error('APP_URL environment variable not configured - cannot send password reset email');
      // Still return success to prevent email enumeration
      return c.json({ message: 'If the email exists, a reset link will be sent' });
    }

    const emailResult = await sendPasswordResetEmail(
      c.env,
      user.email,
      user.name,
      resetToken,
      baseUrl
    );
```

**Step 2: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/routes/auth.js
git commit -m "fix: require APP_URL env var for password reset emails, stop trusting request headers"
```

---

### Task 7: Make registration response generic to prevent email enumeration

**Files:**
- Modify: `src/routes/auth.js:106-113`

**Step 1: Return generic response for duplicate email**

In `src/routes/auth.js`, replace lines 106-113:

From:
```javascript
    // Check if email already exists
    const existingUser = await db.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first();

    if (existingUser) {
      return c.json({ error: 'Email already registered' }, 409);
    }
```

To:
```javascript
    // Check if email already exists
    const existingUser = await db.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first();

    if (existingUser) {
      // Return generic error that doesn't reveal email existence
      return c.json({ error: 'Registration could not be completed. Please try a different email or contact support.' }, 400);
    }
```

**Step 2: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/routes/auth.js
git commit -m "fix: use generic error for duplicate email registration to prevent enumeration"
```

---

### Task 8: Fix N+1 query in students endpoint

**Files:**
- Modify: `src/routes/students.js:252-290`

**Step 1: Replace N+1 loop with batch queries**

In `src/routes/students.js`, replace lines 252-290 (the `for` loop) with batch-fetched data:

From:
```javascript
    // Fetch reading sessions and preferences for each student
    for (const student of students) {
      const sessions = await db.prepare(`
        SELECT rs.*, b.title as book_title, b.author as book_author
        FROM reading_sessions rs
        LEFT JOIN books b ON rs.book_id = b.id
        WHERE rs.student_id = ?
        ORDER BY rs.session_date DESC
      `).bind(student.id).all();

      student.readingSessions = (sessions.results || []).map(s => ({
        id: s.id,
        date: s.session_date,
        bookTitle: s.book_title || s.book_title_manual,
        bookAuthor: s.book_author || s.book_author_manual,
        bookId: s.book_id,
        pagesRead: s.pages_read,
        duration: s.duration_minutes,
        assessment: s.assessment,
        notes: s.notes,
        location: s.location || 'school',
        recordedBy: s.recorded_by
      }));

      // Recalculate streak on-the-fly from sessions (ensures accuracy even if student hasn't read recently)
      const streakData = calculateStreak(
        student.readingSessions.map(s => ({ date: s.date })),
        { gracePeriodDays, timezone }
      );
      student.currentStreak = streakData.currentStreak;
      student.longestStreak = Math.max(streakData.longestStreak, student.longestStreak); // Keep historical longest
      student.streakStartDate = streakData.streakStartDate;

      // Fetch student preferences
      student.preferences = await fetchStudentPreferences(db, student.id);
      // Also include likes/dislikes from the students table in preferences
      student.preferences.likes = student.likes || [];
      student.preferences.dislikes = student.dislikes || [];
    }
```

To:
```javascript
    // Batch-fetch all reading sessions for all students in this org (single query)
    const studentIds = students.map(s => s.id);

    let allSessions = [];
    let allPreferences = [];

    if (studentIds.length > 0) {
      const sessionPlaceholders = studentIds.map(() => '?').join(',');
      const sessionsResult = await db.prepare(`
        SELECT rs.*, b.title as book_title, b.author as book_author
        FROM reading_sessions rs
        LEFT JOIN books b ON rs.book_id = b.id
        WHERE rs.student_id IN (${sessionPlaceholders})
        ORDER BY rs.session_date DESC
      `).bind(...studentIds).all();
      allSessions = sessionsResult.results || [];

      // Batch-fetch all preferences for all students (single query)
      const prefsResult = await db.prepare(`
        SELECT sp.student_id, sp.genre_id, sp.preference_type, g.name as genre_name
        FROM student_preferences sp
        LEFT JOIN genres g ON sp.genre_id = g.id
        WHERE sp.student_id IN (${sessionPlaceholders})
      `).bind(...studentIds).all();
      allPreferences = prefsResult.results || [];
    }

    // Group sessions and preferences by student_id
    const sessionsByStudent = {};
    for (const s of allSessions) {
      if (!sessionsByStudent[s.student_id]) sessionsByStudent[s.student_id] = [];
      sessionsByStudent[s.student_id].push(s);
    }

    const prefsByStudent = {};
    for (const p of allPreferences) {
      if (!prefsByStudent[p.student_id]) prefsByStudent[p.student_id] = [];
      prefsByStudent[p.student_id].push(p);
    }

    // Map data to each student
    for (const student of students) {
      const sessions = sessionsByStudent[student.id] || [];
      student.readingSessions = sessions.map(s => ({
        id: s.id,
        date: s.session_date,
        bookTitle: s.book_title || s.book_title_manual,
        bookAuthor: s.book_author || s.book_author_manual,
        bookId: s.book_id,
        pagesRead: s.pages_read,
        duration: s.duration_minutes,
        assessment: s.assessment,
        notes: s.notes,
        location: s.location || 'school',
        recordedBy: s.recorded_by
      }));

      // Recalculate streak on-the-fly
      const streakData = calculateStreak(
        student.readingSessions.map(s => ({ date: s.date })),
        { gracePeriodDays, timezone }
      );
      student.currentStreak = streakData.currentStreak;
      student.longestStreak = Math.max(streakData.longestStreak, student.longestStreak);
      student.streakStartDate = streakData.streakStartDate;

      // Build preferences from batch data
      const prefs = prefsByStudent[student.id] || [];
      student.preferences = {
        favoriteGenreIds: [],
        likes: student.likes || [],
        dislikes: student.dislikes || []
      };
      for (const row of prefs) {
        if (row.preference_type === 'favorite') {
          student.preferences.favoriteGenreIds.push(row.genre_id);
        } else if (row.preference_type === 'like') {
          student.preferences.likes.push(row.genre_name || row.genre_id);
        } else if (row.preference_type === 'dislike') {
          student.preferences.dislikes.push(row.genre_name || row.genre_id);
        }
      }
    }
```

This replaces 2N queries with exactly 2 queries regardless of student count.

**Step 2: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/routes/students.js
git commit -m "perf: replace N+1 queries with batch fetch in students endpoint"
```

---

### Task 9: Sanitize error messages for 5xx responses

**Files:**
- Modify: `src/middleware/errorHandler.js:17-22`
- Modify: `src/worker.js:234-241`

**Step 1: Sanitize 5xx errors in errorHandler middleware**

In `src/middleware/errorHandler.js`, replace lines 17-22:

From:
```javascript
      // Format error response
      return c.json({
        status: 'error',
        message: error.message || 'Internal Server Error',
        path: c.req.path
      }, status);
```

To:
```javascript
      // For 5xx errors, don't leak internal details to client
      const message = status >= 500
        ? 'Internal Server Error'
        : (error.message || 'An error occurred');

      return c.json({
        status: 'error',
        message,
        path: c.req.path
      }, status);
```

**Step 2: Sanitize 5xx errors in worker onError**

In `src/worker.js`, replace lines 234-241:

From:
```javascript
// Error handler
app.onError((err, c) => {
  console.error(`Error: ${err.message}`);
  return c.json({
    status: 'error',
    message: err.message || 'Internal Server Error'
  }, err.status || 500);
});
```

To:
```javascript
// Error handler
app.onError((err, c) => {
  console.error(`Error: ${err.message}`);
  const status = err.status || 500;
  const message = status >= 500
    ? 'Internal Server Error'
    : (err.message || 'An error occurred');

  return c.json({
    status: 'error',
    message
  }, status);
});
```

**Step 3: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/middleware/errorHandler.js src/worker.js
git commit -m "fix: sanitize 5xx error responses to prevent internal detail leakage"
```

---

### Task 10: Add empty slug guard

**Files:**
- Modify: `src/routes/auth.js:60-67`

**Step 1: Add fallback for empty slug**

In `src/routes/auth.js`, replace `generateSlug` function (lines 60-67):

From:
```javascript
function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}
```

To:
```javascript
function generateSlug(name) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
  return slug || 'org';
}
```

**Step 2: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/routes/auth.js
git commit -m "fix: guard against empty slug from special-character-only org names"
```
