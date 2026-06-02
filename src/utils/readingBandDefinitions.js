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
  { index: 13, name: 'Grey', color: '#9AA0A6', textColor: '#3A352E' },
  { index: 14, name: 'Dark Blue', color: '#1F3A93', textColor: '#FFFFFF' },
  { index: 15, name: 'Free Reader', color: '#6B4FA0', textColor: '#FFFFFF' },
];

export const READING_BAND_COUNT = READING_BAND_LADDER.length;
export const DEFAULT_READS_PER_BAND = 20;

export const DEFAULT_BAND_COLORS = READING_BAND_LADDER.map((b) => b.color);

const DARK_TEXT = '#3A352E';
const LIGHT_TEXT = '#FFFFFF';
const HEX6 = /^#[0-9A-Fa-f]{6}$/;

// WCAG relative luminance of a #RRGGBB colour (0..1).
function relativeLuminance(hex) {
  const c = String(hex == null ? '' : hex).replace('#', '');
  const toLin = (pair) => {
    const s = parseInt(pair, 16) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * toLin(c.slice(0, 2)) + 0.7152 * toLin(c.slice(2, 4)) + 0.0722 * toLin(c.slice(4, 6))
  );
}

function contrastRatio(l1, l2) {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Best-contrast text colour for a band background. Compares the ACTUAL contrast
 * ratio of the background against the two real text colours (#3A352E dark,
 * #FFFFFF white) and returns the higher — a luminance threshold alone
 * misclassifies mid-tones like Gold and Blue.
 */
export function pickTextColor(hex) {
  if (!HEX6.test(String(hex || ''))) return DARK_TEXT;
  const bg = relativeLuminance(hex);
  const darkL = relativeLuminance(DARK_TEXT);
  const lightL = 1.0;
  return contrastRatio(bg, lightL) >= contrastRatio(bg, darkL) ? LIGHT_TEXT : DARK_TEXT;
}

export const getBandByIndex = (i, palette) => {
  const clamped = Math.max(0, Math.min(Number(i) || 0, READING_BAND_COUNT - 1));
  const base = READING_BAND_LADDER[clamped];
  const override = Array.isArray(palette) ? palette[clamped] : null;
  const color = HEX6.test(String(override || '')) ? override : base.color;
  return { index: base.index, name: base.name, color, textColor: pickTextColor(color) };
};
