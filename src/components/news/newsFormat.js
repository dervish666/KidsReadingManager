// Small date helpers shared by the Reading News ticker + page. Dates in the
// feed are plain ISO `YYYY-MM-DD` strings.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parse(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `{ day, mon }` for a date badge, or null. */
export function dateParts(iso) {
  const d = parse(iso);
  return d ? { day: d.getDate(), mon: MONTHS[d.getMonth()] } : null;
}

/** e.g. "28 Jul", or null. */
export function shortDate(iso) {
  const p = dateParts(iso);
  return p ? `${p.day} ${p.mon}` : null;
}

/** e.g. "28 July 2026", or null. */
export function longDate(iso) {
  const d = parse(iso);
  try {
    return d
      ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;
  } catch {
    return null;
  }
}

/** Dated events ascending by date (drops undated entries). */
export function sortEvents(events) {
  return (events || []).filter((e) => e && e.date).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Live countdown to a future date — computed at render time, never stored, so
 * it stays accurate. Returns "today" / "tomorrow" / "in N days|weeks|months",
 * or null if the date is past or invalid.
 */
export function countdownLabel(iso) {
  const d = parse(iso);
  if (!d) return null;
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const e0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((e0 - t0) / 86400000);
  if (days < 0) return null;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 45) return `in ${days} days`;
  if (days <= 70) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

/** 1 -> "1st", 2 -> "2nd", 4 -> "4th". */
export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
