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
