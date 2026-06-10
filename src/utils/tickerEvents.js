/**
 * Ticker events — intra-day celebration messages (band-ups, badge awards)
 * shown in rotation by the header Reading News ticker for the rest of the day.
 *
 * buildTickerMessages(studentName, { bandUp, newBadges }) — pure message builder
 * recordSessionTickerEvents(db, orgId, studentId, { bandUp, newBadges }) — persist
 *
 * Rows are short-lived: the 2 AM cron deletes anything older than two days.
 */

import { generateId } from './helpers.js';

/** Celebration lines for a session's side-effects. Pure — no I/O. */
export function buildTickerMessages(studentName, { bandUp = null, newBadges = [] } = {}) {
  const name = (studentName || '').trim();
  if (!name) return [];

  const messages = [];
  if (bandUp?.to?.name) {
    messages.push({
      type: 'band',
      message: `🎉 ${name} has moved up to the ${bandUp.to.name} band!`,
    });
  }
  for (const badge of newBadges || []) {
    if (!badge?.name) continue;
    messages.push({
      type: 'badge',
      message: `🏅 ${name} earned the ${badge.name} badge!`,
    });
  }
  return messages;
}

/**
 * Record celebration events for a just-logged session. Best-effort — callers
 * wrap in runSafe; a failure here never blocks the session write.
 */
export async function recordSessionTickerEvents(
  db,
  organizationId,
  studentId,
  { bandUp = null, newBadges = [] } = {}
) {
  if (!bandUp && (!newBadges || newBadges.length === 0)) return;

  const student = await db
    .prepare('SELECT name FROM students WHERE id = ? AND organization_id = ?')
    .bind(studentId, organizationId)
    .first();
  if (!student?.name) return;

  const messages = buildTickerMessages(student.name, { bandUp, newBadges });
  if (messages.length === 0) return;

  const stmt = db.prepare(
    `INSERT INTO ticker_events (id, organization_id, student_id, type, message)
     VALUES (?, ?, ?, ?, ?)`
  );
  await db.batch(
    messages.map((m) => stmt.bind(generateId(), organizationId, studentId, m.type, m.message))
  );
}
