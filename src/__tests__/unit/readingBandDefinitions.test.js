import { describe, it, expect } from 'vitest';
import {
  READING_BAND_LADDER,
  READING_BAND_COUNT,
  DEFAULT_READS_PER_BAND,
  getBandByIndex,
  DEFAULT_BAND_COLORS,
  pickTextColor,
} from '../../utils/readingBandDefinitions.js';

describe('readingBandDefinitions', () => {
  it('has 16 ordered bands from Lilac to Free Reader', () => {
    expect(READING_BAND_COUNT).toBe(16);
    expect(READING_BAND_LADDER[0].name).toBe('Lilac');
    expect(READING_BAND_LADDER[15].name).toBe('Free Reader');
    READING_BAND_LADDER.forEach((b, i) => expect(b.index).toBe(i));
  });

  it('every band has a hex colour and text colour', () => {
    for (const b of READING_BAND_LADDER) {
      expect(b.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(b.textColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('getBandByIndex clamps out-of-range indices', () => {
    expect(getBandByIndex(-5).name).toBe('Lilac');
    expect(getBandByIndex(99).name).toBe('Free Reader');
    expect(getBandByIndex(2).name).toBe('Red');
  });

  it('default reads-per-band is 20', () => {
    expect(DEFAULT_READS_PER_BAND).toBe(20);
  });
});

describe('pickTextColor (auto-contrast)', () => {
  it('picks dark text on light/mid colours', () => {
    expect(pickTextColor('#FFFFFF')).toBe('#3A352E');
    expect(pickTextColor('#D4AF37')).toBe('#3A352E'); // Gold — the contrast fix
    expect(pickTextColor('#F4D03F')).toBe('#3A352E'); // Yellow
  });
  it('picks white text on dark colours', () => {
    expect(pickTextColor('#000000')).toBe('#FFFFFF');
    expect(pickTextColor('#1F3A93')).toBe('#FFFFFF'); // Dark Blue
    expect(pickTextColor('#2E86DE')).toBe('#FFFFFF'); // Blue — proves ratio method beats a naive threshold
  });
  it('falls back to dark text on bad input', () => {
    expect(pickTextColor('not-a-colour')).toBe('#3A352E');
    expect(pickTextColor(null)).toBe('#3A352E');
  });
});

describe('DEFAULT_BAND_COLORS', () => {
  it('is the 16 ladder colours in order', () => {
    expect(DEFAULT_BAND_COLORS).toHaveLength(16);
    expect(DEFAULT_BAND_COLORS[0]).toBe('#C8A2C8');
    expect(DEFAULT_BAND_COLORS[15]).toBe('#6B4FA0');
  });
});

describe('getBandByIndex with palette', () => {
  it('uses the palette colour and auto-contrast text when given', () => {
    const palette = [...DEFAULT_BAND_COLORS];
    palette[2] = '#000000';
    const b = getBandByIndex(2, palette);
    expect(b.color).toBe('#000000');
    expect(b.textColor).toBe('#FFFFFF');
    expect(b.name).toBe('Red');
  });
  it('falls back to default colour without a palette', () => {
    const b = getBandByIndex(9);
    expect(b.color).toBe('#D4AF37');
    expect(b.textColor).toBe('#3A352E');
  });
  it('ignores a malformed palette entry and uses the default', () => {
    const b = getBandByIndex(2, ['bad']);
    expect(b.color).toBe('#D7263D');
  });
});
