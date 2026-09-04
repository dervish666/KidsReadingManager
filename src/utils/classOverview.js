/**
 * Pure helpers behind the teacher overview dialog (opened from the name chip
 * in the header). Everything here works on the students and classes already
 * held in DataContext, so opening the dialog costs no request.
 */

/** Days between an ISO date (YYYY-MM-DD) and today (also YYYY-MM-DD). */
function daysBetween(isoDate, todayIso) {
  if (!isoDate) return null;
  const [ty, tm, td] = todayIso.split('-').map(Number);
  const [y, m, d] = String(isoDate).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000);
}

function normaliseName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Which classes count as "this teacher's". In order:
 *  1. `user.assignedClassIds` (Wonde employee↔class links, stamped into the JWT)
 *  2. classes whose synced or typed teacher name matches the user's name
 *  3. nothing — the caller decides how to fall back (the dialog offers the
 *     currently selected class instead)
 *
 * @param {{ assignedClassIds?: string[], name?: string }|null} user
 * @param {Array<{id: string, name: string, teacherName?: string, teacherNames?: string[], isActive?: boolean}>} classes
 * @returns {{ classes: Array, via: 'assigned' | 'name' | 'none' }}
 */
export function resolveTeacherClasses(user, classes) {
  const active = (classes || []).filter((c) => c && c.isActive !== false);
  const byName = (a, b) => a.name.localeCompare(b.name);

  const assignedIds = new Set(user?.assignedClassIds || []);
  if (assignedIds.size > 0) {
    const assigned = active.filter((c) => assignedIds.has(c.id)).sort(byName);
    if (assigned.length > 0) return { classes: assigned, via: 'assigned' };
  }

  const me = normaliseName(user?.name);
  if (me) {
    const matched = active
      .filter((c) => {
        const names = [c.teacherName, ...(c.teacherNames || [])].filter(Boolean);
        return names.some((n) => normaliseName(n) === me);
      })
      .sort(byName);
    if (matched.length > 0) return { classes: matched, via: 'name' };
  }

  return { classes: [], via: 'none' };
}

/**
 * One class, summarised for a glance. Status counts come from the caller's
 * `getReadingStatus` so the dialog agrees with the colour-coding everywhere
 * else in the app (the thresholds are a school setting).
 *
 * @param {Object} params
 * @param {Array} params.students - all students in DataContext
 * @param {string} params.classId
 * @param {(student: Object) => 'recent'|'attention'|'overdue'|'never'} params.getReadingStatus
 * @param {string} [params.today] - YYYY-MM-DD, defaults to today in local time
 * @param {number} [params.catchUpLimit=5]
 */
export function summariseClass({ students, classId, getReadingStatus, today, catchUpLimit = 5 }) {
  const todayIso = today || new Date().toLocaleDateString('en-CA');
  const pupils = (students || []).filter((s) => s && s.classId === classId && s.isActive !== false);

  const status = { recent: 0, attention: 0, overdue: 0, never: 0 };
  let readToday = 0;
  let readThisWeek = 0;
  let activeStreaks = 0;
  let longestStreak = null;
  const needsRead = [];

  for (const s of pupils) {
    const st = getReadingStatus(s);
    if (status[st] !== undefined) status[st] += 1;

    const days = daysBetween(s.lastReadDate, todayIso);
    if (days === 0) readToday += 1;
    if (days !== null && days >= 0 && days <= 6) readThisWeek += 1;

    if ((s.currentStreak || 0) > 0) activeStreaks += 1;
    if ((s.currentStreak || 0) > (longestStreak?.days || 0)) {
      longestStreak = { name: s.name, days: s.currentStreak };
    }

    if (st === 'overdue' || st === 'never') {
      needsRead.push({ name: s.name, days });
    }
  }

  // Longest wait first; never-read pupils (days null) go to the front.
  needsRead.sort((a, b) => {
    if (a.days === null && b.days === null) return a.name.localeCompare(b.name);
    if (a.days === null) return -1;
    if (b.days === null) return 1;
    return b.days - a.days;
  });

  return {
    pupils: pupils.length,
    readToday,
    readThisWeek,
    status,
    activeStreaks,
    longestStreak,
    catchUp: needsRead.slice(0, catchUpLimit),
    catchUpTotal: needsRead.length,
  };
}
