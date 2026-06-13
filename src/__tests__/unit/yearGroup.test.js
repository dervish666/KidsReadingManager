import { describe, it, expect } from 'vitest';
import {
  yearGroupToAgeBand,
  classNameToYearGroup,
  yearGroupToKeyStage,
} from '../../utils/yearGroup.js';

describe('yearGroupToAgeBand', () => {
  it('maps Wonde current_nc_year numeric codes to (N+4)-(N+5)', () => {
    // Wonde stores bare numbers — "2" is Year 2 ≈ 6-7 years old.
    expect(yearGroupToAgeBand('2')).toEqual({ min: 6, max: 7 });
    expect(yearGroupToAgeBand('1')).toEqual({ min: 5, max: 6 });
    expect(yearGroupToAgeBand('6')).toEqual({ min: 10, max: 11 });
    expect(yearGroupToAgeBand('11')).toEqual({ min: 15, max: 16 });
    expect(yearGroupToAgeBand('13')).toEqual({ min: 17, max: 18 });
    expect(yearGroupToAgeBand(2)).toEqual({ min: 6, max: 7 }); // numeric type
  });

  it('maps Reception (Wonde "R") and nursery', () => {
    expect(yearGroupToAgeBand('R')).toEqual({ min: 4, max: 5 });
    expect(yearGroupToAgeBand('reception')).toEqual({ min: 4, max: 5 });
    expect(yearGroupToAgeBand('0')).toEqual({ min: 4, max: 5 });
    expect(yearGroupToAgeBand('N1')).toEqual({ min: 3, max: 4 });
    expect(yearGroupToAgeBand('nursery')).toEqual({ min: 3, max: 4 });
  });

  it('also parses the other formats found in this codebase ("Year 2", "Y2")', () => {
    expect(yearGroupToAgeBand('Year 2')).toEqual({ min: 6, max: 7 });
    expect(yearGroupToAgeBand('Y2')).toEqual({ min: 6, max: 7 });
    expect(yearGroupToAgeBand('yr 6')).toEqual({ min: 10, max: 11 });
  });

  it('returns null for missing or unparseable values', () => {
    expect(yearGroupToAgeBand(null)).toBeNull();
    expect(yearGroupToAgeBand(undefined)).toBeNull();
    expect(yearGroupToAgeBand('')).toBeNull();
    expect(yearGroupToAgeBand('   ')).toBeNull();
    expect(yearGroupToAgeBand('unknown')).toBeNull();
    expect(yearGroupToAgeBand('99')).toBeNull(); // out of range
  });
});

describe('classNameToYearGroup', () => {
  it('derives the year from numeric registration-group names (real Cheddar Grove classes)', () => {
    expect(classNameToYearGroup('1P')).toBe('1');
    expect(classNameToYearGroup('2A')).toBe('2');
    expect(classNameToYearGroup('3CD')).toBe('3');
    expect(classNameToYearGroup('4PP')).toBe('4');
    expect(classNameToYearGroup('5D')).toBe('5');
    expect(classNameToYearGroup('6W')).toBe('6');
  });

  it('maps Reception groups (R-prefixed) to Reception', () => {
    expect(classNameToYearGroup('RF')).toBe('R');
    expect(classNameToYearGroup('RJM')).toBe('R');
    expect(classNameToYearGroup('R')).toBe('R');
  });

  it('also handles "Year N" / "YN" class names', () => {
    expect(classNameToYearGroup('Year 5')).toBe('5');
    expect(classNameToYearGroup('Y6')).toBe('6');
  });

  it('returns null for tree/colour names that encode no year', () => {
    expect(classNameToYearGroup('Willow')).toBeNull();
    expect(classNameToYearGroup('Cherry')).toBeNull();
    expect(classNameToYearGroup(null)).toBeNull();
    expect(classNameToYearGroup('')).toBeNull();
  });

  it('round-trips through yearGroupToAgeBand to a coarse band', () => {
    expect(yearGroupToAgeBand(classNameToYearGroup('5D'))).toEqual({ min: 9, max: 10 });
    expect(yearGroupToAgeBand(classNameToYearGroup('RF'))).toEqual({ min: 4, max: 5 });
  });
});

describe('yearGroupToKeyStage', () => {
  it('maps Reception/Y1/Y2 to KS1 (across all formats)', () => {
    expect(yearGroupToKeyStage('Reception')).toBe('KS1');
    expect(yearGroupToKeyStage('R')).toBe('KS1');
    expect(yearGroupToKeyStage('Y1')).toBe('KS1');
    expect(yearGroupToKeyStage('Y2')).toBe('KS1');
    // The bug this fixes: real stored formats used to fall through to LowerKS2.
    expect(yearGroupToKeyStage('Year 2')).toBe('KS1'); // demo format
    expect(yearGroupToKeyStage('2')).toBe('KS1'); // Wonde current_nc_year
    expect(yearGroupToKeyStage('5')).toBe('UpperKS2'); // class-derived "5D" → "5"
  });

  it('maps Y3/Y4 to LowerKS2 and Y5/Y6 to UpperKS2', () => {
    expect(yearGroupToKeyStage('Y3')).toBe('LowerKS2');
    expect(yearGroupToKeyStage('Year 4')).toBe('LowerKS2');
    expect(yearGroupToKeyStage('Y5')).toBe('UpperKS2');
    expect(yearGroupToKeyStage('Y6')).toBe('UpperKS2');
  });

  it('treats nursery as KS1 (consistent with Reception)', () => {
    expect(yearGroupToKeyStage('Nursery')).toBe('KS1');
    expect(yearGroupToKeyStage('N1')).toBe('KS1');
  });

  it('defaults to LowerKS2 when the year group is missing or unparseable', () => {
    expect(yearGroupToKeyStage(null)).toBe('LowerKS2');
    expect(yearGroupToKeyStage(undefined)).toBe('LowerKS2');
    expect(yearGroupToKeyStage('Willow')).toBe('LowerKS2');
  });
});
