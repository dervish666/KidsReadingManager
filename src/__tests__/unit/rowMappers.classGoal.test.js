import { describe, it, expect } from 'vitest';
import { rowToClassGoal } from '../../utils/rowMappers.js';

describe('rowToClassGoal', () => {
  it('maps snake_case DB row to camelCase object', () => {
    const row = {
      id: 'g1',
      organization_id: 'org1',
      class_id: 'c1',
      metric: 'sessions',
      target: 500,
      current: 204,
      term: 'Spring 1 2025/26',
      achieved_at: null,
      created_at: '2026-04-01T00:00:00Z',
    };
    const result = rowToClassGoal(row);
    expect(result).toEqual({
      id: 'g1',
      organizationId: 'org1',
      classId: 'c1',
      metric: 'sessions',
      target: 500,
      current: 204,
      term: 'Spring 1 2025/26',
      achievedAt: null,
      createdAt: '2026-04-01T00:00:00Z',
    });
  });

  it('returns null for null input', () => {
    expect(rowToClassGoal(null)).toBeNull();
  });
});
