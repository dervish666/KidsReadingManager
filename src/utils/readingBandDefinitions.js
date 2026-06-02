/**
 * Reading Band ladder — a gamified VOLUME rank (not a difficulty level).
 * A child climbs one band per `readsPerBand` reads logged in the academic year.
 * Fixed in v1; only the reads-per-band threshold is configurable per school.
 */

export const READING_BAND_LADDER = [
  { index: 0, name: 'Lilac', color: '#C8A2C8', textColor: '#3A352E' },
  { index: 1, name: 'Pink', color: '#FFC0CB', textColor: '#3A352E' },
  { index: 2, name: 'Red', color: '#D7263D', textColor: '#FFFFFF' },
  { index: 3, name: 'Yellow', color: '#F4D03F', textColor: '#3A352E' },
  { index: 4, name: 'Blue', color: '#2E86DE', textColor: '#FFFFFF' },
  { index: 5, name: 'Green', color: '#27AE60', textColor: '#FFFFFF' },
  { index: 6, name: 'Orange', color: '#E67E22', textColor: '#FFFFFF' },
  { index: 7, name: 'Turquoise', color: '#1ABC9C', textColor: '#FFFFFF' },
  { index: 8, name: 'Purple', color: '#8E44AD', textColor: '#FFFFFF' },
  { index: 9, name: 'Gold', color: '#D4AF37', textColor: '#3A352E' },
  { index: 10, name: 'White', color: '#FFFFFF', textColor: '#3A352E' },
  { index: 11, name: 'Lime', color: '#A4C639', textColor: '#3A352E' },
  { index: 12, name: 'Brown', color: '#8B5E3C', textColor: '#FFFFFF' },
  { index: 13, name: 'Grey', color: '#9AA0A6', textColor: '#FFFFFF' },
  { index: 14, name: 'Dark Blue', color: '#1F3A93', textColor: '#FFFFFF' },
  { index: 15, name: 'Free Reader', color: '#6B4FA0', textColor: '#FFFFFF' },
];

export const READING_BAND_COUNT = READING_BAND_LADDER.length;
export const DEFAULT_READS_PER_BAND = 20;

export const getBandByIndex = (i) => {
  const clamped = Math.max(0, Math.min(Number(i) || 0, READING_BAND_COUNT - 1));
  return READING_BAND_LADDER[clamped];
};
