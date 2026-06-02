import { describe, it, expect } from 'vitest';
import { decideParentBandCelebration } from '../../routes/parent.js';

describe('decideParentBandCelebration', () => {
  it('adopts silently on first view (marker null)', () => {
    const r = decideParentBandCelebration(null, 3);
    expect(r.bandUp).toBeNull();
    expect(r.newSeen).toBe(3);
  });
  it('celebrates a climb and advances the marker', () => {
    const r = decideParentBandCelebration(2, 4);
    expect(r.bandUp).not.toBeNull();
    expect(r.bandUp.from.name).toBe('Red');
    expect(r.bandUp.to.name).toBe('Blue');
    expect(r.newSeen).toBe(4);
  });
  it('no celebration when band unchanged or lower', () => {
    expect(decideParentBandCelebration(4, 4).bandUp).toBeNull();
    expect(decideParentBandCelebration(4, 2).bandUp).toBeNull();
    expect(decideParentBandCelebration(4, 2).newSeen).toBe(4); // marker never decreases
  });
});
