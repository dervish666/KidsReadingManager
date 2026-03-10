# Design: Lazy-Load Student Sessions

## Date: 2026-03-10

## Problem

GET /api/students returns all students with their entire reading session history and preferences embedded. For a school with 500 students averaging 50 sessions each, that's 25,000 session rows in a single response on every login. Teachers only need data for their class and the current date range.

## Solution

Stop bundling session data with the student list. Each component fetches exactly the sessions it needs, scoped by class, date range, or student.

## Backend Changes

### Slim Student List

GET /api/students returns summary fields only:

```
id, name, classId, className, currentBookId, currentBookTitle, currentBookAuthor,
readingLevelMin, readingLevelMax, lastReadDate, currentStreak, longestStreak,
streakStartDate, totalSessionCount
```

No `readingSessions` array. No `preferences` object. `totalSessionCount` computed via SQL subquery:

```sql
SELECT s.*, (SELECT COUNT(*) FROM reading_sessions rs WHERE rs.student_id = s.id) as total_session_count ...
```

### New Endpoints

**GET /api/students/sessions?classId=X&startDate=Y&endDate=Z**
- Used by: HomeReadingRegister, ReadingStats
- Returns sessions for all students in a class within a date range
- Org-scoped via tenant middleware

**GET /api/students/:id/sessions**
- Used by: StudentProfile, StudentSessions, SessionForm, StudentInfoCard, BookRecommendations
- Returns all sessions for one student (supports `?limit=N`)
- Org-scoped via tenant middleware

**GET /api/stats?classId=X&startDate=Y&endDate=Z**
- Server-side aggregation replacing the frontend stats useMemo
- Returns: `{ totalStudents, totalSessions, statusDistribution, locationDistribution, weeklyActivity, mostReadBooks, readingByDay, streakStats }`
- All computed in SQL

### Unchanged

- Student CRUD endpoints unchanged
- addReadingSession / deleteReadingSession unchanged (callers refetch their own data)
- Preferences fetched via existing GET /api/students/:id when needed

## Frontend Changes

### AppContext

- `reloadDataFromServer` no longer fetches sessions or preferences with student list
- Remove session/preference batch-fetch code from students route handler
- `students` state holds summary objects only

### Component Migration

| Component | Before | After |
|-----------|--------|-------|
| HomeReadingRegister | student.readingSessions | GET /api/students/sessions?classId&startDate&endDate |
| ReadingStats | useMemo iterating all sessions | GET /api/stats?classId&startDate&endDate |
| StudentProfile | student.readingSessions, student.preferences | GET /api/students/:id (full detail) |
| BookRecommendations | sessions for booksRead | GET /api/students/:id on student select |
| SessionForm | sessions for "previous sessions" | GET /api/students/:id/sessions?limit=10 |
| StudentSessions | student.readingSessions | GET /api/students/:id/sessions |
| StudentInfoCard | derives lastSession, recentBooks | GET /api/students/:id/sessions?limit=5 |
| StudentList/Card/Table | readingSessions.length | totalSessionCount from summary |
| PrioritizedStudentsList | student.lastReadDate | No change (uses summary field) |
| BulkImport | name duplicate checking | No change (no sessions needed) |

### Loading States

Each component that fetches on demand gets a loading skeleton. Responses are class-scoped or single-student so should be <200ms.

### Session Mutation Flow

After addReadingSession or deleteReadingSession, the calling component refetches its own data. No global session cache to keep in sync.

## Impact

- **Login:** 500 students: ~50KB summary vs ~2MB+ with all sessions
- **Navigation:** 200ms loading per component vs instant (acceptable trade-off)
- **Memory:** Only active component's sessions in memory vs all sessions for all students
- **No new migrations** (totalSessionCount via subquery, not stored column)
