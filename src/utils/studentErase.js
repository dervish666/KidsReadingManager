/**
 * The canonical per-student erasure statement set, shared by the interactive
 * Article 17 erase (routes/students/gdpr.js) and the 90-day retention cron
 * (worker.js). One list so the two paths cannot drift — the audit-16 gap was
 * exactly that: the cron deleted 4 tables while the interactive erase deleted
 * 7, leaving live parent_access_tokens (a working portal for an erased child),
 * badges and stats behind.
 *
 * FK order: child rows first, then the student row. Deletes are explicit
 * rather than relying on FK CASCADE — D1 only enforces foreign keys when
 * PRAGMA foreign_keys = ON is set per-connection.
 */
export function studentEraseStatements(db, studentId) {
  return [
    db.prepare('DELETE FROM reading_sessions WHERE student_id = ?').bind(studentId),
    db.prepare('DELETE FROM student_preferences WHERE student_id = ?').bind(studentId),
    db.prepare('DELETE FROM student_badges WHERE student_id = ?').bind(studentId),
    db.prepare('DELETE FROM student_reading_stats WHERE student_id = ?').bind(studentId),
    db.prepare('DELETE FROM parent_access_tokens WHERE student_id = ?').bind(studentId),
    db.prepare('DELETE FROM student_recommendations WHERE student_id = ?').bind(studentId),
    db.prepare('DELETE FROM ticker_events WHERE student_id = ?').bind(studentId),
    db.prepare('DELETE FROM students WHERE id = ?').bind(studentId),
  ];
}

// Statements per student — callers size their D1 batch chunks from this so a
// new table added above can't silently push a chunk past the 100-statement cap.
export const STUDENT_ERASE_STATEMENT_COUNT = 8;
