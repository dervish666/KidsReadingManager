import { describe, it, expect } from 'vitest';
import { rowToTourCompletion } from '../../utils/rowMappers';

describe('rowToTourCompletion', () => {
  it('returns null for null/undefined input', () => {
    expect(rowToTourCompletion(null)).toBeNull();
    expect(rowToTourCompletion(undefined)).toBeNull();
  });

  it('maps snake_case DB row to camelCase object', () => {
    const row = {
      id: 1,
      user_id: 42,
      tour_id: 'students',
      tour_version: 2,
      completed_at: '2026-03-26T12:00:00Z',
    };
    expect(rowToTourCompletion(row)).toEqual({
      id: 1,
      userId: 42,
      tourId: 'students',
      version: 2,
      completedAt: '2026-03-26T12:00:00Z',
    });
  });
});
