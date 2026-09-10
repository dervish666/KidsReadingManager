/**
 * Small, shared "how long ago" labels for last-read dates. Several stats
 * views each had their own copy with slightly different wording.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysSince(dateLike, now = new Date()) {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((now - d) / DAY_MS));
}

export function daysAgoLabel(dateLike, now = new Date()) {
  const days = daysSince(dateLike, now);
  if (days === null) return 'Never read';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

export function formatShortDate(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
