import { describe, it, expect } from 'vitest';
import {
  readContribution,
  countReads,
  computeBandIndex,
  academicYearStart,
  bandForCount,
  bandTransition,
} from '../../utils/readingBandEngine.js';
import { DEFAULT_BAND_COLORS } from '../../utils/readingBandDefinitions.js';

describe('readContribution', () => {
  it('plain session counts as 1', () => {
    expect(readContribution(null)).toBe(1);
    expect(readContribution('Read with mum')).toBe(1);
  });
  it('[COUNT:n] multiple counts as n', () => {
    expect(readContribution('[COUNT:3]')).toBe(3);
    expect(readContribution('note [COUNT:5] more')).toBe(5);
  });
  it('absent / no-record count as 0', () => {
    expect(readContribution('[ABSENT]')).toBe(0);
    expect(readContribution('[NO_RECORD]')).toBe(0);
  });
});

describe('countReads', () => {
  it('sums contributions across rows', () => {
    const rows = [{ notes: null }, { notes: '[COUNT:3]' }, { notes: '[ABSENT]' }, { notes: 'x' }];
    expect(countReads(rows)).toBe(5); // 1 + 3 + 0 + 1
  });
  it('handles empty input', () => {
    expect(countReads([])).toBe(0);
    expect(countReads(null)).toBe(0);
  });
});

describe('computeBandIndex', () => {
  it('maps reads to band index at 20/band', () => {
    expect(computeBandIndex(0, 20)).toBe(0);
    expect(computeBandIndex(19, 20)).toBe(0);
    expect(computeBandIndex(20, 20)).toBe(1);
    expect(computeBandIndex(47, 20)).toBe(2);
    expect(computeBandIndex(300, 20)).toBe(15);
  });
  it('caps at the top band', () => {
    expect(computeBandIndex(10000, 20)).toBe(15);
  });
  it('respects a custom threshold and falls back on bad input', () => {
    expect(computeBandIndex(15, 5)).toBe(3);
    expect(computeBandIndex(40, 0)).toBe(2); // 0 -> default 20
  });
});

describe('academicYearStart', () => {
  it('Sept onwards uses this year', () => {
    expect(academicYearStart('2026-09-01')).toBe('2026-09-01');
    expect(academicYearStart('2026-12-15')).toBe('2026-09-01');
  });
  it('before Sept uses last year', () => {
    expect(academicYearStart('2026-08-31')).toBe('2025-09-01');
    expect(academicYearStart('2026-01-10')).toBe('2025-09-01');
  });
});

describe('bandForCount', () => {
  it('returns display payload with progress to next', () => {
    const b = bandForCount(47, 20);
    expect(b.name).toBe('Red');
    expect(b.nextAt).toBe(60);
    expect(b.toNext).toBe(13);
    expect(b.atTop).toBe(false);
  });
  it('top band has null progress', () => {
    const b = bandForCount(320, 20);
    expect(b.name).toBe('Free Reader');
    expect(b.toNext).toBeNull();
    expect(b.atTop).toBe(true);
  });
});

describe('bandTransition', () => {
  it('describes a climb', () => {
    const t = bandTransition(2, 4);
    expect(t.from.name).toBe('Red');
    expect(t.to.name).toBe('Blue');
  });
});

describe('palette threading', () => {
  it('bandForCount uses the palette colour', () => {
    const palette = [...DEFAULT_BAND_COLORS];
    palette[2] = '#111111';
    const b = bandForCount(47, 20, palette); // 47 reads -> band 2 (Red)
    expect(b.color).toBe('#111111');
    expect(b.textColor).toBe('#FFFFFF');
  });
  it('bandTransition uses the palette colours', () => {
    const palette = [...DEFAULT_BAND_COLORS];
    palette[4] = '#222222';
    const t = bandTransition(2, 4, palette);
    expect(t.to.color).toBe('#222222');
  });
  it('works without a palette (defaults)', () => {
    expect(bandForCount(47, 20).color).toBe('#D7263D');
  });
});

describe('variable band count', () => {
  const bands = [
    { name: 'Bronze', color: '#CD7F32' },
    { name: 'Silver', color: '#C0C0C0' },
    { name: 'Gold', color: '#FFD700' },
  ];

  it('computeBandIndex caps at a custom band count', () => {
    expect(computeBandIndex(40, 20, 3)).toBe(2); // would be 2 anyway
    expect(computeBandIndex(200, 20, 3)).toBe(2); // capped at top of a 3-band ladder
    expect(computeBandIndex(200, 20, 5)).toBe(4); // capped at top of a 5-band ladder
  });

  it('bandForCount reports the top band of a short ladder', () => {
    const b = bandForCount(200, 20, bands);
    expect(b.name).toBe('Gold');
    expect(b.atTop).toBe(true);
    expect(b.toNext).toBeNull();
  });

  it('bandForCount shows progress toward the next custom band', () => {
    const b = bandForCount(25, 20, bands); // band 1 of 3
    expect(b.name).toBe('Silver');
    expect(b.atTop).toBe(false);
    expect(b.nextAt).toBe(40);
    expect(b.toNext).toBe(15);
  });

  it('bandTransition uses custom names', () => {
    const t = bandTransition(0, 2, bands);
    expect(t.from.name).toBe('Bronze');
    expect(t.to.name).toBe('Gold');
  });
});
