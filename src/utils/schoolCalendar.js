/**
 * School calendar context.
 *
 * Turns an organisation's `term_dates` rows plus today's date into the handful
 * of facts an AI summary needs to read the figures correctly.
 *
 * This exists because the first version of the Stats AI summary had no idea
 * what day it was. On 15 August it reported "reading activity has stalled
 * completely in the past two weeks" and told the head to check whether staff
 * had stopped logging — during the summer holidays, 29 days after term ended.
 * Every figure it quoted was accurate and the conclusion was nonsense.
 *
 * Two things poison a summary generated outside term time:
 *   1. "This week" and "last week" counts, which are always relative to today
 *      regardless of the period filter, and are legitimately zero in a holiday.
 *   2. The reading-status flags, which are days-since-last-read and therefore
 *      flag the entire school after any break of more than a week.
 *
 * Pure and date-injected so it is testable — never reads the clock itself.
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** `2026-08-15` → epoch ms at UTC midnight. NaN for anything unparseable. */
function toMs(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return NaN;
  return Date.parse(`${iso}T00:00:00Z`);
}

/** `2026-08-15` → `Saturday 15 August 2026`. Returns the input if unparseable. */
export function formatLongDate(iso) {
  const ms = toMs(iso);
  if (Number.isNaN(ms)) return String(iso);
  const d = new Date(ms);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Whole days between two ISO dates (b - a). Null if either is unparseable. */
function daysBetween(a, b) {
  const ams = toMs(a);
  const bms = toMs(b);
  if (Number.isNaN(ams) || Number.isNaN(bms)) return null;
  return Math.round((bms - ams) / DAY_MS);
}

function termShape(row) {
  if (!row) return null;
  return {
    name: `${row.term_name} ${row.academic_year}`.trim(),
    startDate: row.start_date,
    endDate: row.end_date,
  };
}

/**
 * Count days in the window of `windowDays` ending on `today` (inclusive) that
 * were school days: Monday–Friday AND inside one of the given terms.
 *
 * This is the single number that makes a holiday summary sane. "Zero sessions
 * in two weeks" means something very different when those two weeks contained
 * zero school days.
 */
function countSchoolDays(terms, today, windowDays) {
  const todayMs = toMs(today);
  if (Number.isNaN(todayMs) || !terms.length) return 0;
  let count = 0;
  for (let i = 0; i < windowDays; i += 1) {
    const d = new Date(todayMs - i * DAY_MS);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue; // weekend
    const iso = d.toISOString().slice(0, 10);
    if (terms.some((t) => iso >= t.start_date && iso <= t.end_date)) count += 1;
  }
  return count;
}

/**
 * Build the calendar context for a summary prompt.
 *
 * @param {Array<{academic_year: string, term_name: string, start_date: string, end_date: string}>} termRows
 *   All `term_dates` rows for the organisation, any academic year, any order.
 *   Deliberately NOT scoped to the "current" academic year: from 1 August the
 *   app's academic-year helper rolls over to the next year, and a school that
 *   has not yet entered next year's dates would otherwise look like it had no
 *   calendar at all — exactly when knowing it is the summer holiday matters most.
 * @param {string} today - YYYY-MM-DD in the organisation's timezone
 * @returns {Object} Calendar facts, all plain values safe to put in a prompt
 */
export function buildCalendarContext(termRows, today) {
  const terms = (Array.isArray(termRows) ? termRows : [])
    .filter((r) => r && r.start_date && r.end_date)
    .slice()
    .sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0));

  const base = {
    today,
    todayLong: formatLongDate(today),
    hasTermDates: terms.length > 0,
    status: 'unknown',
    currentTerm: null,
    previousTerm: null,
    nextTerm: null,
    daysSinceTermEnded: null,
    daysUntilTermStarts: null,
    schoolDaysInLast7: 0,
    schoolDaysInLast14: 0,
  };

  if (!terms.length) return base;

  const current = terms.find((t) => today >= t.start_date && today <= t.end_date) || null;
  const previous = [...terms].reverse().find((t) => t.end_date < today) || null;
  const next = terms.find((t) => t.start_date > today) || null;

  let status;
  if (current) status = 'in_term';
  else if (previous && next) status = 'break';
  else if (previous && !next) status = 'after_last_known_term';
  else status = 'before_first_known_term';

  return {
    ...base,
    status,
    currentTerm: termShape(current),
    previousTerm: termShape(previous),
    nextTerm: termShape(next),
    daysSinceTermEnded: previous ? daysBetween(previous.end_date, today) : null,
    daysUntilTermStarts: next ? daysBetween(today, next.start_date) : null,
    schoolDaysInLast7: countSchoolDays(terms, today, 7),
    schoolDaysInLast14: countSchoolDays(terms, today, 14),
  };
}

/**
 * One-sentence description of where in the school year today sits, written for
 * the model to quote rather than re-derive.
 */
export function describeCalendarStatus(cal) {
  switch (cal.status) {
    case 'in_term':
      return `in term time — ${cal.currentTerm.name}, which runs ${formatLongDate(cal.currentTerm.startDate)} to ${formatLongDate(cal.currentTerm.endDate)}`;
    case 'break':
      return `on a school break between ${cal.previousTerm.name} (ended ${formatLongDate(cal.previousTerm.endDate)}, ${cal.daysSinceTermEnded} days ago) and ${cal.nextTerm.name} (starts ${formatLongDate(cal.nextTerm.startDate)}, in ${cal.daysUntilTermStarts} days)`;
    case 'after_last_known_term':
      return `outside the school year — the last term the school has entered, ${cal.previousTerm.name}, ended ${formatLongDate(cal.previousTerm.endDate)}, ${cal.daysSinceTermEnded} days ago, and no later term dates have been entered yet`;
    case 'before_first_known_term':
      return `before the start of the school's entered calendar — the first term, ${cal.nextTerm.name}, starts ${formatLongDate(cal.nextTerm.startDate)}, in ${cal.daysUntilTermStarts} days`;
    default:
      return 'unknown — this school has not entered its term dates, so whether today is term time or a holiday cannot be determined';
  }
}
