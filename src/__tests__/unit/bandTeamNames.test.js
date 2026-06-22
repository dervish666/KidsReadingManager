import { describe, it, expect } from 'vitest';
import {
  hexToHsl,
  colourFamily,
  suggestColourNames,
  suggestTeamNames,
} from '../../utils/bandTeamNames.js';
import { DEFAULT_BANDS } from '../../utils/readingBandDefinitions.js';

describe('hexToHsl', () => {
  it('converts primaries', () => {
    expect(hexToHsl('#FF0000').h).toBeCloseTo(0, 0);
    expect(Math.round(hexToHsl('#00FF00').h)).toBe(120);
    expect(Math.round(hexToHsl('#0000FF').h)).toBe(240);
  });
  it('treats white/black as achromatic', () => {
    expect(hexToHsl('#FFFFFF')).toMatchObject({ s: 0, l: 1 });
    expect(hexToHsl('#000000')).toMatchObject({ s: 0, l: 0 });
  });
  it('returns null for non-hex input', () => {
    expect(hexToHsl('rebeccapurple')).toBeNull();
    expect(hexToHsl(null)).toBeNull();
    expect(hexToHsl('#fff')).toBeNull();
  });
});

describe('colourFamily — default ladder', () => {
  // The 16 default colours, in order, must bucket into these families.
  const expected = [
    'purple', // Lilac
    'pink', // Pink
    'red', // Red
    'yellow', // Yellow
    'blue', // Blue
    'green', // Green
    'orange', // Orange
    'turquoise', // Turquoise
    'purple', // Purple
    'yellow', // Gold
    'white', // White
    'green', // Lime
    'brown', // Brown
    'grey', // Grey
    'blue', // Dark Blue
    'purple', // Free Reader
  ];
  it('classifies every default band sensibly', () => {
    expect(DEFAULT_BANDS.map((b) => colourFamily(b.color))).toEqual(expected);
  });
});

describe('colourFamily — boundary cases', () => {
  it('separates pink (light red) from red', () => {
    expect(colourFamily('#FFC0CB')).toBe('pink'); // light → pink
    expect(colourFamily('#D7263D')).toBe('red'); // saturated mid → red
    expect(colourFamily('#FF69B4')).toBe('pink'); // hot pink
  });
  it('separates brown (dark orange) from orange', () => {
    expect(colourFamily('#8B5E3C')).toBe('brown');
    expect(colourFamily('#E67E22')).toBe('orange');
  });
  it('detects earthy/muted warm colours as brown (adversarial pass)', () => {
    expect(colourFamily('#A52A2A')).toBe('brown'); // CSS brown (dark red)
    expect(colourFamily('#CD853F')).toBe('brown'); // peru
    expect(colourFamily('#D2B48C')).toBe('brown'); // tan
    expect(colourFamily('#DEB887')).toBe('brown'); // burlywood
  });
  it('keeps vivid warm colours out of brown', () => {
    expect(colourFamily('#D7263D')).toBe('red'); // saturated red
    expect(colourFamily('#F4D03F')).toBe('yellow'); // bright yellow
    expect(colourFamily('#D4AF37')).toBe('yellow'); // gold stays yellow, not brown
  });
  it('reads aquamarine as turquoise (boundary nudge)', () => {
    expect(colourFamily('#7FFFD4')).toBe('turquoise');
  });
  it('handles neutrals by lightness', () => {
    expect(colourFamily('#FFFFFF')).toBe('white');
    expect(colourFamily('#000000')).toBe('black');
    expect(colourFamily('#9AA0A6')).toBe('grey');
  });
  it('places teal/turquoise between green and blue', () => {
    expect(colourFamily('#1ABC9C')).toBe('turquoise');
  });
  it('falls back to grey for invalid colours', () => {
    expect(colourFamily('not-a-colour')).toBe('grey');
    expect(colourFamily(undefined)).toBe('grey');
  });
});

describe('suggestColourNames / suggestTeamNames', () => {
  it('returns one name per band', () => {
    expect(suggestColourNames(DEFAULT_BANDS)).toHaveLength(16);
    expect(suggestTeamNames(DEFAULT_BANDS)).toHaveLength(16);
  });

  it('produces unique, non-empty names across the default ladder', () => {
    for (const names of [suggestColourNames(DEFAULT_BANDS), suggestTeamNames(DEFAULT_BANDS)]) {
      expect(names.every((n) => typeof n === 'string' && n.trim().length > 0)).toBe(true);
      expect(new Set(names).size).toBe(names.length); // all unique
      expect(names.every((n) => n.length <= 30)).toBe(true); // fits the name field
    }
  });

  it('de-duplicates repeated colours within the same family', () => {
    const bands = [
      { name: '', color: '#2E86DE' },
      { name: '', color: '#2E86DE' },
      { name: '', color: '#2E86DE' },
    ];
    const names = suggestTeamNames(bands);
    expect(new Set(names).size).toBe(3);
    expect(names[0]).toBe('Blue Crew');
  });

  it('gives plain colour words for the colour-name flavour', () => {
    const names = suggestColourNames([
      { name: '', color: '#2E86DE' },
      { name: '', color: '#FFC0CB' },
      { name: '', color: '#27AE60' },
    ]);
    expect(names).toEqual(['Blue', 'Pink', 'Green']);
  });

  it('suffixes once a family pool is exhausted', () => {
    // Red has a 4-name pool, so a 5th red must fall back to a numbered name.
    const bands = Array.from({ length: 5 }, () => ({ name: '', color: '#D7263D' }));
    const names = suggestTeamNames(bands);
    expect(new Set(names).size).toBe(5);
    expect(names[4]).toMatch(/\d$/);
  });

  it('handles invalid colours without throwing', () => {
    const names = suggestTeamNames([{ name: '', color: 'oops' }]);
    expect(names).toHaveLength(1);
    expect(typeof names[0]).toBe('string');
  });
});
