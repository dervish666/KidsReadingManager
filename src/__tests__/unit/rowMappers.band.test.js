import { describe, it, expect } from 'vitest';
import { rowToStudent } from '../../utils/rowMappers.js';

describe('rowToStudent band fields', () => {
  it('maps current_band and band_reads_count', () => {
    const s = rowToStudent({ id: 's1', name: 'Aria', current_band: 2, band_reads_count: 47 });
    expect(s.currentBand).toBe(2);
    expect(s.bandReadsCount).toBe(47);
  });
  it('defaults to band 0 when absent', () => {
    const s = rowToStudent({ id: 's1', name: 'Aria' });
    expect(s.currentBand).toBe(0);
    expect(s.bandReadsCount).toBe(0);
    expect(s.baselineReads).toBe(0);
  });
  it('maps baseline_reads', () => {
    const s = rowToStudent({ id: 's1', name: 'Aria', baseline_reads: 30 });
    expect(s.baselineReads).toBe(30);
  });
});
