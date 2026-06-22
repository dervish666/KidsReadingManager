import { describe, it, expect } from 'vitest';
import {
  READING_BAND_LADDER,
  READING_BAND_COUNT,
  DEFAULT_READS_PER_BAND,
  getBandByIndex,
  DEFAULT_BAND_COLORS,
  DEFAULT_BANDS,
  resolveBands,
  bandCountOf,
  MIN_BANDS,
  MAX_BANDS,
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
  it('ignores a malformed colour entry and uses the default for that band', () => {
    const palette = [...DEFAULT_BAND_COLORS];
    palette[2] = 'bad';
    const b = getBandByIndex(2, palette);
    expect(b.color).toBe('#D7263D');
  });
});

describe('getBandByIndex with custom { name, color } bands', () => {
  const bands = [
    { name: 'Bronze', color: '#CD7F32' },
    { name: 'Silver', color: '#C0C0C0' },
    { name: 'Gold', color: '#FFD700' },
  ];

  it('returns the custom name and colour', () => {
    const b = getBandByIndex(1, bands);
    expect(b.name).toBe('Silver');
    expect(b.color).toBe('#C0C0C0');
  });

  it('clamps to the custom list length (shorter ladder)', () => {
    const top = getBandByIndex(99, bands);
    expect(top.name).toBe('Gold');
    expect(top.index).toBe(2);
  });

  it('falls back to a ladder name when a custom name is blank', () => {
    const b = getBandByIndex(0, [{ name: '   ', color: '#123456' }, ...bands.slice(1)]);
    expect(b.name).toBe('Lilac'); // ladder[0]
    expect(b.color).toBe('#123456');
  });
});

describe('resolveBands / bandCountOf', () => {
  it('passes through a valid object list', () => {
    const list = [
      { name: 'A', color: '#111111' },
      { name: 'B', color: '#222222' },
    ];
    expect(resolveBands(list)).toEqual(list);
    expect(bandCountOf(list)).toBe(2);
  });

  it('zips a legacy colour-only array with ladder names', () => {
    const resolved = resolveBands(['#111111', '#222222']);
    expect(resolved).toEqual([
      { name: 'Lilac', color: '#111111' },
      { name: 'Pink', color: '#222222' },
    ]);
  });

  it('falls back to the default ladder for empty/invalid input', () => {
    expect(resolveBands([])).toBe(DEFAULT_BANDS);
    expect(resolveBands(null)).toBe(DEFAULT_BANDS);
    expect(bandCountOf(null)).toBe(READING_BAND_COUNT);
  });
});

describe('DEFAULT_BANDS / bounds', () => {
  it('default list matches the ladder names and colours', () => {
    expect(DEFAULT_BANDS).toHaveLength(16);
    expect(DEFAULT_BANDS[0]).toEqual({ name: 'Lilac', color: '#C8A2C8' });
    expect(DEFAULT_BANDS[15]).toEqual({ name: 'Free Reader', color: '#6B4FA0' });
  });
  it('bounds are sane', () => {
    expect(MIN_BANDS).toBeLessThan(MAX_BANDS);
    expect(MIN_BANDS).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_BANDS.length).toBeLessThanOrEqual(MAX_BANDS);
  });
});
