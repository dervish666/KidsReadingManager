import { describe, it, expect } from 'vitest';
import { buildTickerMessages } from '../../utils/tickerEvents.js';

describe('buildTickerMessages', () => {
  const bandUp = { from: { name: 'Blue' }, to: { name: 'Green' } };
  const badges = [
    { id: 'first-steps', name: 'First Steps', tier: 'bronze' },
    { id: 'bookworm', name: 'Bookworm', tier: 'silver' },
  ];

  it('builds a band-up message', () => {
    const messages = buildTickerMessages('Alice Smith', { bandUp });
    expect(messages).toEqual([
      { type: 'band', message: '🎉 Alice Smith has moved up to the Green band!' },
    ]);
  });

  it('builds one message per new badge', () => {
    const messages = buildTickerMessages('Alice Smith', { newBadges: badges });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({
      type: 'badge',
      message: '🏅 Alice Smith earned the First Steps badge!',
    });
    expect(messages[1].message).toContain('Bookworm');
  });

  it('combines band-up and badges, band first', () => {
    const messages = buildTickerMessages('Bob', { bandUp, newBadges: badges });
    expect(messages.map((m) => m.type)).toEqual(['band', 'badge', 'badge']);
  });

  it('returns nothing without a student name', () => {
    expect(buildTickerMessages('', { bandUp, newBadges: badges })).toEqual([]);
    expect(buildTickerMessages('   ', { bandUp })).toEqual([]);
    expect(buildTickerMessages(null, { bandUp })).toEqual([]);
  });

  it('skips malformed inputs', () => {
    expect(buildTickerMessages('Alice', {})).toEqual([]);
    expect(buildTickerMessages('Alice', { bandUp: { to: {} }, newBadges: [{}] })).toEqual([]);
  });
});
