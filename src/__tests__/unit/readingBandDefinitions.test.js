import { describe, it, expect } from 'vitest';
import {
  READING_BAND_LADDER,
  READING_BAND_COUNT,
  DEFAULT_READS_PER_BAND,
  getBandByIndex,
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
