/**
 * Pure reading-band maths. No I/O — mirrors streakCalculator.js so it can be
 * unit-tested in isolation and reused by the route layer.
 */
import {
  READING_BAND_COUNT,
  DEFAULT_READS_PER_BAND,
  getBandByIndex,
} from './readingBandDefinitions.js';

const COUNT_MARKER = /\[COUNT:(\d+)\]/;

/** Reads contributed by one session, from its `notes` marker. */
export function readContribution(notes) {
  if (!notes) return 1;
  if (notes.includes('[ABSENT]') || notes.includes('[NO_RECORD]')) return 0;
  const m = notes.match(COUNT_MARKER);
  if (m) return parseInt(m[1], 10) || 0;
  return 1;
}

/** Total qualifying reads across an array of rows with a `notes` field. */
export function countReads(rows) {
  if (!rows || rows.length === 0) return 0;
  return rows.reduce((sum, r) => sum + readContribution(r.notes), 0);
}

function effectivePer(readsPerBand) {
  const per = parseInt(readsPerBand, 10);
  return per > 0 ? per : DEFAULT_READS_PER_BAND;
}

/** Band index (0..15) for a read count. */
export function computeBandIndex(readsCount, readsPerBand = DEFAULT_READS_PER_BAND) {
  const per = effectivePer(readsPerBand);
  const idx = Math.floor((Number(readsCount) || 0) / per);
  return Math.max(0, Math.min(idx, READING_BAND_COUNT - 1));
}

/** ISO date (YYYY-MM-DD) of the academic-year start (1 Sep) on/before `today`. */
export function academicYearStart(today, startMonth = 9, startDay = 1) {
  const s = typeof today === 'string' ? today : null;
  let year;
  let month;
  let dom;
  if (s && /^\d{4}-\d{2}-\d{2}/.test(s)) {
    year = parseInt(s.slice(0, 4), 10);
    month = parseInt(s.slice(5, 7), 10);
    dom = parseInt(s.slice(8, 10), 10);
  } else {
    const d = today instanceof Date ? today : new Date();
    year = d.getUTCFullYear();
    month = d.getUTCMonth() + 1;
    dom = d.getUTCDate();
  }
  const afterStart = month > startMonth || (month === startMonth && dom >= startDay);
  const startYear = afterStart ? year : year - 1;
  return `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
}

/** Display payload for a band, including progress to the next band. */
export function bandForCount(readsCount, readsPerBand = DEFAULT_READS_PER_BAND) {
  const per = effectivePer(readsPerBand);
  const count = Number(readsCount) || 0;
  const index = computeBandIndex(count, per);
  const band = getBandByIndex(index);
  const atTop = index >= READING_BAND_COUNT - 1;
  const nextAt = atTop ? null : (index + 1) * per;
  const toNext = atTop ? null : nextAt - count;
  return { ...band, readsCount: count, readsPerBand: per, nextAt, toNext, atTop };
}

/** Transition object for a celebration (from band -> to band). */
export function bandTransition(fromIndex, toIndex) {
  return { from: getBandByIndex(fromIndex), to: getBandByIndex(toIndex) };
}
