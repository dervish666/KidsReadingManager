# Lazy-Load Student Sessions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove session/preference data from the student list response; each component fetches only the sessions it needs, scoped by class/date/student.

**Architecture:** Backend strips sessions from GET /api/students, adds 3 new endpoints (class sessions, single student sessions, server-side stats). Frontend components manage their own session state with on-demand fetching. AppContext session mutation functions simplified to API-call-only.

**Tech Stack:** Hono routes, D1 SQL aggregation, React useState/useEffect for local session state.

**Design doc:** `docs/plans/2026-03-10-lazy-load-sessions-design.md`

---

### Task 1: Slim the GET /api/students Response

**Files:**
- Modify: `src/routes/students.js:189-298`
- Test: `src/__tests__/integration/students.test.js`

**Step 1: Update the student list SQL query to include totalSessionCount**

In `src/routes/students.js`, replace the student query at line 195 with:

```javascript
    const result = await db.prepare(`
      SELECT s.*, c.name as class_name, b.title as current_book_title, b.author as current_book_author,
        (SELECT COUNT(*) FROM reading_sessions rs WHERE rs.student_id = s.id) as total_session_count
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN books b ON s.current_book_id = b.id
      WHERE s.organization_id = ? AND s.is_active = 1
      ORDER BY s.name ASC
    `).bind(organizationId).all();
```

**Step 2: Remove the session/preference batch-fetch block**

Delete lines 209-289 (the BIND_LIMIT chunking loop that fetches all sessions and preferences, groups them by student, and attaches readingSessions/preferences to each student).

Replace the student mapping at line 204 with:

```javascript
    const students = (result.results || []).map(row => ({
      ...rowToStudent(row),
      className: row.class_name,
      totalSessionCount: row.total_session_count || 0
    }));

    return c.json(students);
```

**Step 3: Update rowToStudent to not expect sessions**

In `src/utils/rowMappers.js`, confirm `rowToStudent` doesn't attach readingSessions — it shouldn't (sessions are attached in the route handler, not the mapper). No change expected here, but verify.

**Step 4: Update integration tests**

In `src/__tests__/integration/students.test.js`, update any tests that assert on `readingSessions` or `preferences` in the GET / response. These fields should no longer be present. Add an assertion for `totalSessionCount`.

**Step 5: Run tests and commit**

```bash
npx vitest run src/__tests__/integration/students.test.js
git add src/routes/students.js src/__tests__/integration/students.test.js
git commit -m "perf: remove sessions/preferences from student list response"
```

---

### Task 2: Add GET /api/students/sessions Endpoint (Class Sessions)

**Files:**
- Modify: `src/routes/students.js`
- Create test cases in: `src/__tests__/integration/students.test.js`

**Step 1: Write integration tests**

Add tests to `students.test.js`:

```javascript
describe('GET /api/students/sessions', () => {
  it('should return sessions for a class within date range', ...);
  it('should require classId and startDate and endDate', ...);
  it('should scope sessions to the organization', ...);
  it('should return empty array for no sessions in range', ...);
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/integration/students.test.js --testNamePattern="GET /api/students/sessions"
```

**Step 3: Implement the endpoint**

Add to `src/routes/students.js` before the GET /:id route:

```javascript
studentsRouter.get('/sessions', requireReadonly(), async (c) => {
  if (!isMultiTenantMode(c)) {
    return c.json([]);
  }
  const db = getDB(c.env);
  const organizationId = c.get('organizationId');
  const { classId, startDate, endDate } = c.req.query();

  if (!classId || !startDate || !endDate) {
    throw badRequestError('classId, startDate, and endDate are required');
  }

  const result = await db.prepare(`
    SELECT rs.*, s.name as student_name,
           b.title as book_title, b.author as book_author
    FROM reading_sessions rs
    INNER JOIN students s ON rs.student_id = s.id
    LEFT JOIN books b ON rs.book_id = b.id
    WHERE s.organization_id = ? AND s.class_id = ? AND s.is_active = 1
      AND rs.session_date >= ? AND rs.session_date <= ?
    ORDER BY rs.session_date DESC
  `).bind(organizationId, classId, startDate, endDate).all();

  const sessions = (result.results || []).map(s => ({
    id: s.id,
    studentId: s.student_id,
    date: s.session_date,
    bookId: s.book_id,
    bookTitle: s.book_title || s.book_title_manual,
    bookAuthor: s.book_author || s.book_author_manual,
    pagesRead: s.pages_read,
    duration: s.duration_minutes,
    assessment: s.assessment,
    notes: s.notes,
    location: s.location || 'school',
    recordedBy: s.recorded_by
  }));

  return c.json(sessions);
});
```

**Important:** This route MUST be registered before `/:id` so the router doesn't treat "sessions" as a student ID.

**Step 4: Run tests and commit**

```bash
npx vitest run src/__tests__/integration/students.test.js
git add src/routes/students.js src/__tests__/integration/students.test.js
git commit -m "feat: add GET /api/students/sessions for class-scoped session fetch"
```

---

### Task 3: Add GET /api/stats Endpoint (Server-Side Aggregation)

**Files:**
- Modify: `src/routes/students.js` (or create `src/routes/stats.js` — use students.js to keep it simple)
- Test: `src/__tests__/integration/students.test.js`

**Step 1: Write integration tests**

```javascript
describe('GET /api/students/stats', () => {
  it('should return aggregated stats for a class', ...);
  it('should filter by date range', ...);
  it('should include streak stats from student rows', ...);
  it('should return zero stats for empty class', ...);
});
```

**Step 2: Implement the endpoint**

Add to `src/routes/students.js`:

```javascript
studentsRouter.get('/stats', requireReadonly(), async (c) => {
  if (!isMultiTenantMode(c)) {
    return c.json({});
  }
  const db = getDB(c.env);
  const organizationId = c.get('organizationId');
  const { classId, startDate, endDate } = c.req.query();

  // Base student filter
  let studentWhere = 's.organization_id = ? AND s.is_active = 1';
  const studentBinds = [organizationId];
  if (classId && classId !== 'all') {
    if (classId === 'unassigned') {
      studentWhere += ' AND s.class_id IS NULL';
    } else {
      studentWhere += ' AND s.class_id = ?';
      studentBinds.push(classId);
    }
  }

  // Get student summary (count, streak stats, status distribution)
  const studentsResult = await db.prepare(`
    SELECT s.id, s.last_read_date, s.current_streak, s.longest_streak, s.streak_start_date
    FROM students s
    LEFT JOIN classes c ON s.class_id = c.id
    WHERE ${studentWhere} AND (s.class_id IS NULL OR c.disabled = 0)
  `).bind(...studentBinds).all();

  const studentList = studentsResult.results || [];
  const studentIds = studentList.map(s => s.id);

  // Session aggregation query
  let sessionStats = { totalSessions: 0, locationDistribution: { home: 0, school: 0 },
    weeklyActivity: { thisWeek: 0, lastWeek: 0 }, readingByDay: {}, mostReadBooks: [] };

  if (studentIds.length > 0 && startDate && endDate) {
    // Aggregate sessions in SQL
    const BIND_LIMIT = 90;
    let allSessionRows = [];
    for (let i = 0; i < studentIds.length; i += BIND_LIMIT) {
      const chunk = studentIds.slice(i, i + BIND_LIMIT);
      const placeholders = chunk.map(() => '?').join(',');
      const sessResult = await db.prepare(`
        SELECT rs.session_date, rs.location, b.title as book_title
        FROM reading_sessions rs
        LEFT JOIN books b ON rs.book_id = b.id
        WHERE rs.student_id IN (${placeholders})
          AND rs.session_date >= ? AND rs.session_date <= ?
      `).bind(...chunk, startDate, endDate).all();
      allSessionRows.push(...(sessResult.results || []));
    }

    // Compute aggregates from rows
    const locationCounts = { home: 0, school: 0 };
    const dayCounts = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const bookCounts = {};
    const now = new Date();
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0,0,0,0);
    const startOfLastWeek = new Date(startOfWeek); startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
    let thisWeek = 0, lastWeek = 0;

    for (const row of allSessionRows) {
      const loc = row.location || 'school';
      if (locationCounts.hasOwnProperty(loc)) locationCounts[loc]++;
      if (row.session_date) {
        const d = new Date(row.session_date);
        dayCounts[dayNames[d.getDay()]]++;
        if (d >= startOfWeek) thisWeek++;
        else if (d >= startOfLastWeek) lastWeek++;
      }
      if (row.book_title) {
        bookCounts[row.book_title] = (bookCounts[row.book_title] || 0) + 1;
      }
    }

    const mostReadBooks = Object.entries(bookCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([title, count]) => ({ title, count }));

    sessionStats = {
      totalSessions: allSessionRows.length,
      locationDistribution: locationCounts,
      weeklyActivity: { thisWeek, lastWeek },
      readingByDay: dayCounts,
      mostReadBooks
    };
  }

  // Compute streak + status stats from student rows (no sessions needed)
  // Use settings from query or defaults
  const settings = c.get('settings') || {};
  const recentlyReadDays = settings.recentlyReadDays || 3;
  const needsAttentionDays = settings.needsAttentionDays || 7;

  let studentsWithNoSessions = 0;
  let studentsWithActiveStreak = 0, totalActiveStreakDays = 0;
  let longestCurrentStreak = 0, longestEverStreak = 0;
  const statusCounts = { notRead: 0, needsAttention: 0, recentlyRead: 0 };
  const streakLeaderboard = [];

  for (const s of studentList) {
    // Status from lastReadDate
    if (!s.last_read_date) {
      statusCounts.notRead++;
      studentsWithNoSessions++;
    } else {
      const diffDays = Math.ceil((new Date() - new Date(s.last_read_date)) / 86400000);
      if (diffDays <= recentlyReadDays) statusCounts.recentlyRead++;
      else if (diffDays <= needsAttentionDays) statusCounts.needsAttention++;
      else statusCounts.notRead++;
    }

    const cs = s.current_streak || 0;
    const ls = s.longest_streak || 0;
    if (cs > 0) {
      studentsWithActiveStreak++;
      totalActiveStreakDays += cs;
      if (cs > longestCurrentStreak) longestCurrentStreak = cs;
    }
    if (ls > longestEverStreak) longestEverStreak = ls;
    if (cs > 0 || ls > 0) {
      streakLeaderboard.push({ id: s.id, currentStreak: cs, longestStreak: ls, streakStartDate: s.streak_start_date });
    }
  }

  const topStreaks = streakLeaderboard
    .sort((a, b) => b.currentStreak - a.currentStreak || b.longestStreak - a.longestStreak)
    .slice(0, 5);

  return c.json({
    totalStudents: studentList.length,
    ...sessionStats,
    averageSessionsPerStudent: studentList.length > 0 ? sessionStats.totalSessions / studentList.length : 0,
    studentsWithNoSessions,
    statusDistribution: statusCounts,
    studentsWithActiveStreak,
    totalActiveStreakDays,
    longestCurrentStreak,
    longestEverStreak,
    averageStreak: studentsWithActiveStreak > 0 ? totalActiveStreakDays / studentsWithActiveStreak : 0,
    topStreaks
  });
});
```

**Step 3: Run tests and commit**

```bash
npx vitest run src/__tests__/integration/students.test.js
git add src/routes/students.js src/__tests__/integration/students.test.js
git commit -m "feat: add GET /api/students/stats for server-side aggregation"
```

---

### Task 4: Simplify AppContext Session Functions

**Files:**
- Modify: `src/contexts/AppContext.js:1267-1478`
- Test: Existing AppContext tests (if any), plus component tests will validate

**Step 1: Update addReadingSession**

Replace the optimistic update that modifies `student.readingSessions` (lines 1296-1352) with a simpler version that only updates student summary fields:

```javascript
const addReadingSession = useCallback(
  async (studentId, sessionData) => {
    const date = sessionData.date || new Date().toISOString().split('T')[0];
    const sessionPayload = {
      date,
      assessment: sessionData.assessment,
      notes: sessionData.notes || '',
      bookId: sessionData.bookId || null,
      bookTitle: sessionData.bookTitle || null,
      bookAuthor: sessionData.bookAuthor || null,
      pagesRead: sessionData.pagesRead || null,
      duration: sessionData.duration || null,
      location: sessionData.location || 'school',
    };

    try {
      const response = await fetchWithAuth(`${API_URL}/students/${studentId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionPayload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const savedSession = await response.json();

      // Update student summary fields (lastReadDate, currentBook)
      setStudents((prev) =>
        prev.map((s) => {
          if (s.id !== studentId) return s;
          const newLastRead = !s.lastReadDate || date > s.lastReadDate ? date : s.lastReadDate;
          return {
            ...s,
            lastReadDate: newLastRead,
            totalSessionCount: (s.totalSessionCount || 0) + 1,
            ...(sessionPayload.bookId && {
              currentBookId: sessionPayload.bookId,
              currentBookTitle: sessionPayload.bookTitle,
              currentBookAuthor: sessionPayload.bookAuthor,
            }),
          };
        })
      );

      setApiError(null);
      return savedSession;
    } catch (error) {
      setApiError(error.message);
      return null;
    }
  },
  [fetchWithAuth]
);
```

**Step 2: Update deleteReadingSession**

Simplify to API call + decrement totalSessionCount:

```javascript
const deleteReadingSession = useCallback(
  async (studentId, sessionId) => {
    try {
      const response = await fetchWithAuth(`${API_URL}/students/${studentId}/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      // Decrement session count on student summary
      setStudents((prev) =>
        prev.map((s) => {
          if (s.id !== studentId) return s;
          return { ...s, totalSessionCount: Math.max(0, (s.totalSessionCount || 0) - 1) };
        })
      );

      setApiError(null);
      return true;
    } catch (error) {
      setApiError(error.message);
      return false;
    }
  },
  [fetchWithAuth]
);
```

Note: `lastReadDate` is not recalculated on delete — the daily cron handles this, and recalculating would require fetching all sessions. This is an acceptable trade-off.

**Step 3: Update editReadingSession similarly**

Same pattern — API call only, no optimistic readingSessions update.

**Step 4: Run tests and commit**

```bash
npx vitest run
git add src/contexts/AppContext.js
git commit -m "refactor: simplify session mutation functions (no global sessions state)"
```

---

### Task 5: Migrate HomeReadingRegister to Local Session State

**Files:**
- Modify: `src/components/sessions/HomeReadingRegister.js`
- Test: `src/__tests__/components/HomeReadingRegister.test.jsx`

This is the most complex component migration.

**Step 1: Add local session state and fetch hook**

At the top of the component, add state and a fetch effect:

```javascript
const [classSessions, setClassSessions] = useState([]);
const [sessionsLoading, setSessionsLoading] = useState(false);

// Fetch sessions for the selected class and date range
useEffect(() => {
  if (!globalClassFilter || globalClassFilter === 'all') {
    setClassSessions([]);
    return;
  }
  const startISO = startDate; // from existing date range useMemo
  const endISO = endDate;
  if (!startISO || !endISO) return;

  setSessionsLoading(true);
  fetchWithAuth(`${API_URL}/students/sessions?classId=${globalClassFilter}&startDate=${startISO}&endDate=${endISO}`)
    .then(r => r.ok ? r.json() : [])
    .then(sessions => {
      setClassSessions(sessions);
      setSessionsLoading(false);
    })
    .catch(() => {
      setClassSessions([]);
      setSessionsLoading(false);
    });
}, [globalClassFilter, startDate, endDate, fetchWithAuth]);
```

**Step 2: Build a sessions-by-student lookup**

```javascript
const sessionsByStudent = useMemo(() => {
  const map = {};
  for (const s of classSessions) {
    if (!map[s.studentId]) map[s.studentId] = [];
    map[s.studentId].push(s);
  }
  return map;
}, [classSessions]);
```

**Step 3: Update getStudentReadingStatus**

Change from `student.readingSessions.filter(...)` to `(sessionsByStudent[student.id] || []).filter(...)`. The function signature changes to take `studentId` and `date` instead of `student` and `date`:

```javascript
const getStudentReadingStatus = useCallback((studentId, date) => {
  const studentSessions = sessionsByStudent[studentId] || [];
  const homeSessions = studentSessions.filter(s => s.date === date && s.location === 'home');
  const schoolSessions = studentSessions.filter(s => s.date === date && s.location === 'school');
  // ... rest of logic unchanged
}, [sessionsByStudent]);
```

Update all call sites to pass `student.id` instead of `student`.

**Step 4: Update handleRecordReading / handleClearReading**

After `addReadingSession` / `deleteReadingSession` succeeds, refetch class sessions:

```javascript
// After successful add/delete, refresh local sessions
const refreshSessions = useCallback(() => {
  if (!globalClassFilter || globalClassFilter === 'all') return;
  fetchWithAuth(`${API_URL}/students/sessions?classId=${globalClassFilter}&startDate=${startDate}&endDate=${endDate}`)
    .then(r => r.ok ? r.json() : [])
    .then(setClassSessions)
    .catch(() => {});
}, [globalClassFilter, startDate, endDate, fetchWithAuth]);
```

Call `refreshSessions()` after each add/delete succeeds.

**Step 5: Add loading state to the UI**

Show a skeleton or spinner when `sessionsLoading` is true instead of the table.

**Step 6: Update tests**

Tests will need to mock the new fetch call to `/api/students/sessions`. Update the mock setup to return session data from this endpoint instead of embedding it in student objects.

**Step 7: Run tests and commit**

```bash
npx vitest run src/__tests__/components/HomeReadingRegister.test.jsx
git add src/components/sessions/HomeReadingRegister.js src/__tests__/components/HomeReadingRegister.test.jsx
git commit -m "refactor: HomeReadingRegister fetches class sessions on demand"
```

---

### Task 6: Migrate ReadingStats to Server-Side Stats

**Files:**
- Modify: `src/components/stats/ReadingStats.js`
- Test: `src/__tests__/components/ReadingStats.test.jsx` (if exists)

**Step 1: Replace the stats useMemo with an API fetch**

Replace the 160-line `stats` useMemo (lines 125-286) with:

```javascript
const [stats, setStats] = useState(null);
const [statsLoading, setStatsLoading] = useState(false);

useEffect(() => {
  setStatsLoading(true);
  const params = new URLSearchParams();
  if (globalClassFilter && globalClassFilter !== 'all') {
    params.set('classId', globalClassFilter);
  }
  if (termDateRange) {
    params.set('startDate', termDateRange.start);
    params.set('endDate', termDateRange.end);
  }
  fetchWithAuth(`${API_URL}/students/stats?${params}`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      setStats(data);
      setStatsLoading(false);
    })
    .catch(() => {
      setStats(null);
      setStatsLoading(false);
    });
}, [globalClassFilter, termDateRange, fetchWithAuth]);
```

**Step 2: Update getStudentsBySessionCount and getStudentsWithStreaks**

These currently re-filter students and access `readingSessions`. Update them to use `totalSessionCount` and streak fields from student summaries:

```javascript
const getStudentsBySessionCount = () => {
  return [...activeStudents].sort((a, b) =>
    (a.totalSessionCount || 0) - (b.totalSessionCount || 0)
  );
};

const getStudentsWithStreaks = () => {
  return activeStudents
    .filter(s => (s.currentStreak || 0) > 0 || (s.longestStreak || 0) > 0)
    .sort((a, b) => (b.currentStreak || 0) - (a.currentStreak || 0));
};
```

**Step 3: Add loading state to UI**

Show skeleton cards when `statsLoading` is true.

**Step 4: Add `topStreaks` student names**

The stats endpoint returns streak data with student IDs but not names. Add names by joining with the local `activeStudents` array:

```javascript
const enrichedTopStreaks = useMemo(() => {
  if (!stats?.topStreaks) return [];
  return stats.topStreaks.map(s => {
    const student = activeStudents.find(st => st.id === s.id);
    return { ...s, name: student?.name || 'Unknown' };
  });
}, [stats, activeStudents]);
```

**Step 5: Run tests and commit**

```bash
npx vitest run
git add src/components/stats/ReadingStats.js
git commit -m "refactor: ReadingStats fetches server-side aggregation"
```

---

### Task 7: Migrate Remaining Components

**Files:**
- Modify: `src/components/sessions/SessionForm.js`
- Modify: `src/components/students/StudentProfile.js`
- Modify: `src/components/BookRecommendations.js`
- Modify: `src/components/sessions/StudentSessions.js`
- Modify: `src/components/sessions/StudentInfoCard.js`

These all need the same pattern: fetch sessions for a single student on demand.

**Step 1: SessionForm (lines 633-707)**

Currently displays `selectedStudent.readingSessions` in "Previous Sessions" section. Add a local fetch:

```javascript
const [recentSessions, setRecentSessions] = useState([]);
useEffect(() => {
  if (!selectedStudent) { setRecentSessions([]); return; }
  fetchWithAuth(`${API_URL}/students/${selectedStudent.id}/sessions?limit=10`)
    .then(r => r.ok ? r.json() : [])
    .then(setRecentSessions)
    .catch(() => setRecentSessions([]));
}, [selectedStudent?.id, fetchWithAuth]);
```

Replace `selectedStudent.readingSessions` references with `recentSessions`.

**Step 2: StudentProfile (lines 81-87)**

Currently derives `studentReadBookIds` from `student.readingSessions`. Add a local fetch:

```javascript
const [studentSessions, setStudentSessions] = useState([]);
useEffect(() => {
  if (!student?.id) return;
  fetchWithAuth(`${API_URL}/students/${student.id}/sessions`)
    .then(r => r.ok ? r.json() : [])
    .then(setStudentSessions)
    .catch(() => setStudentSessions([]));
}, [student?.id, fetchWithAuth]);

const studentReadBookIds = useMemo(() => {
  return [...new Set(studentSessions.map(s => s.bookId).filter(Boolean))];
}, [studentSessions]);
```

**Step 3: BookRecommendations (lines 186-199, 254-265)**

Currently builds `booksRead` from `student.readingSessions`. Replace with local fetch when a student is selected:

```javascript
// In the student selection handler (handleStudentChange and handleQuickPick):
const sessions = await fetchWithAuth(`${API_URL}/students/${studentId}/sessions`)
  .then(r => r.ok ? r.json() : []);
const uniqueBooks = new Map();
sessions.forEach(session => {
  if (session.bookId) {
    uniqueBooks.set(session.bookId, {
      id: session.bookId, bookId: session.bookId,
      dateRead: session.date, assessment: session.assessment
    });
  }
});
setBooksRead(Array.from(uniqueBooks.values()));
```

Also update `getStudentBookCount` (line 170) to use `totalSessionCount` from student summary as an approximation, or count unique bookIds from a lightweight query. Simplest: show `student.totalSessionCount` as a proxy.

**Step 4: StudentSessions**

Currently receives sessions via prop from parent. Update parent to fetch sessions when this component opens.

**Step 5: StudentInfoCard**

Currently derives `lastSession`, `recentBooks` from `student.readingSessions`. Fetch recent sessions:

```javascript
const [recentSessions, setRecentSessions] = useState([]);
useEffect(() => {
  if (!student?.id) return;
  fetchWithAuth(`${API_URL}/students/${student.id}/sessions?limit=5`)
    .then(r => r.ok ? r.json() : [])
    .then(setRecentSessions)
    .catch(() => setRecentSessions([]));
}, [student?.id, fetchWithAuth]);
```

**Step 6: Update component tests**

For each component, update test mocks: remove `readingSessions` from mock student objects, add mock fetch responses for the session endpoints.

**Step 7: Run tests and commit**

```bash
npx vitest run
git add src/components/sessions/SessionForm.js src/components/students/StudentProfile.js \
  src/components/BookRecommendations.js src/components/sessions/StudentSessions.js \
  src/components/sessions/StudentInfoCard.js
git commit -m "refactor: remaining components fetch sessions on demand"
```

---

### Task 8: Clean Up AppContext and StudentList/StudentCard/StudentTable

**Files:**
- Modify: `src/contexts/AppContext.js`
- Modify: `src/components/students/StudentList.js`
- Modify: `src/components/students/StudentCard.js`
- Modify: `src/components/students/StudentTable.js`
- Modify: `src/components/students/PrioritizedStudentsList.js`

**Step 1: Remove readingSessions from AppContext state shape**

Remove any remaining references to `student.readingSessions` in AppContext. The `prioritizedStudents` memo should only use `lastReadDate` (which it already does via `getReadingStatus`).

**Step 2: Update StudentList sorting**

If any sorting uses `readingSessions.length`, replace with `totalSessionCount`.

**Step 3: Update StudentCard/StudentTable**

Replace any `student.readingSessions?.length` or similar with `student.totalSessionCount`.

**Step 4: Run full test suite and commit**

```bash
npx vitest run
git add -A
git commit -m "refactor: remove readingSessions from global state, use totalSessionCount"
```

---

### Task 9: Final Verification and Cleanup

**Step 1: Search for any remaining references**

```bash
grep -r "readingSessions" src/ --include="*.js" --include="*.jsx"
grep -r "\.preferences" src/ --include="*.js" --include="*.jsx" | grep -v node_modules | grep -v "test"
```

Fix any remaining references.

**Step 2: Run full test suite**

```bash
npx vitest run
```

All tests must pass.

**Step 3: Build check**

```bash
npm run build
```

Build must succeed.

**Step 4: Commit and verify**

```bash
git add -A
git commit -m "chore: remove remaining readingSessions references"
```

---

## Dependency Order

Tasks 1-3 (backend) are independent of tasks 4-8 (frontend) and can be verified separately. Within each group:

- **Task 1** must be done first (slims the response)
- **Tasks 2, 3** can be done in parallel (new endpoints)
- **Task 4** must be done before tasks 5-8 (AppContext changes)
- **Tasks 5, 6** are the most complex component migrations
- **Task 7** covers the simpler components
- **Task 8** is final cleanup
- **Task 9** is verification

## Risk Notes

- **HomeReadingRegister** is the riskiest migration — it's the most complex component with heavy session usage. Test thoroughly.
- **Optimistic updates** are removed — components now refetch after mutations. This adds ~200ms latency after recording a session, but simplifies the data flow significantly.
- **`lastReadDate` not recalculated on delete** — the cron handles this. If a teacher deletes the most recent session, `lastReadDate` will be stale until the next cron run. This is acceptable.
- **`totalSessionCount` from subquery** — adds slight overhead to student list query but avoids a migration. Monitor performance; if slow, add a stored column later.
