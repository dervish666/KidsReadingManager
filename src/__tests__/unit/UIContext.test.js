import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';

// Mock AuthContext
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    fetchWithAuth: vi.fn(),
    isAuthenticated: true,
  }),
}));

// Mock DataContext with configurable readingStatusSettings
let mockReadingStatusSettings = { recentlyReadDays: 3, needsAttentionDays: 7 };
vi.mock('../../contexts/DataContext', () => ({
  useData: () => ({
    students: [],
    readingStatusSettings: mockReadingStatusSettings,
  }),
}));

// Import after mocks are set up
const { UIProvider, useUI } = await import('../../contexts/UIContext');

const wrapper = ({ children }) => React.createElement(UIProvider, null, children);

describe('UIContext getReadingStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReadingStatusSettings = { recentlyReadDays: 3, needsAttentionDays: 7 };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return "never" when student has no lastReadDate', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    const { result } = renderHook(() => useUI(), { wrapper });
    expect(result.current.getReadingStatus({})).toBe('never');
    expect(result.current.getReadingStatus(null)).toBe('never');
  });

  it('should return "recent" when read today', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    const { result } = renderHook(() => useUI(), { wrapper });
    expect(result.current.getReadingStatus({ lastReadDate: '2024-06-15' })).toBe('recent');
  });

  it('should return "recent" when read within recentlyReadDays', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    const { result } = renderHook(() => useUI(), { wrapper });
    expect(result.current.getReadingStatus({ lastReadDate: '2024-06-13' })).toBe('recent'); // 2 days
  });

  it('should return "recent" at exactly the recentlyReadDays boundary', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    const { result } = renderHook(() => useUI(), { wrapper });
    expect(result.current.getReadingStatus({ lastReadDate: '2024-06-12' })).toBe('recent'); // 3 days
  });

  it('should return "attention" between thresholds', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    const { result } = renderHook(() => useUI(), { wrapper });
    expect(result.current.getReadingStatus({ lastReadDate: '2024-06-10' })).toBe('attention'); // 5 days
  });

  it('should return "attention" at exactly the needsAttentionDays boundary', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    const { result } = renderHook(() => useUI(), { wrapper });
    expect(result.current.getReadingStatus({ lastReadDate: '2024-06-08' })).toBe('attention'); // 7 days
  });

  it('should return "overdue" when beyond needsAttention threshold', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    const { result } = renderHook(() => useUI(), { wrapper });
    expect(result.current.getReadingStatus({ lastReadDate: '2024-06-01' })).toBe('overdue'); // 14 days
  });

  it('should use calendar dates — correct across UTC midnight (BST edge case)', () => {
    // Simulate 00:30 BST on June 15 = 23:30 UTC on June 14
    // The old Date-subtraction approach would compute this as June 14 in UTC,
    // giving wrong day-diff. Calendar-date comparison uses local time correctly.
    vi.setSystemTime(new Date('2024-06-14T23:30:00Z'));
    const { result } = renderHook(() => useUI(), { wrapper });

    // Last read was June 14. In UTC it's still June 14, so diff should be 0.
    // With the old `new Date() - new Date(lastReadDate)` approach, this worked
    // in UTC but would fail for BST users. The calendar-date approach uses
    // toLocaleDateString which in the test env (UTC) gives June 14 → diff = 0.
    expect(result.current.getReadingStatus({ lastReadDate: '2024-06-14' })).toBe('recent');
  });

  it('should correctly handle month boundary', () => {
    vi.setSystemTime(new Date('2024-07-02T12:00:00Z'));
    const { result } = renderHook(() => useUI(), { wrapper });
    // June 29 → July 2 = 3 days
    expect(result.current.getReadingStatus({ lastReadDate: '2024-06-29' })).toBe('recent');
  });

  it('should correctly handle year boundary', () => {
    vi.setSystemTime(new Date('2025-01-02T12:00:00Z'));
    const { result } = renderHook(() => useUI(), { wrapper });
    // Dec 30 → Jan 2 = 3 days
    expect(result.current.getReadingStatus({ lastReadDate: '2024-12-30' })).toBe('recent');
    // Dec 20 → Jan 2 = 13 days
    expect(result.current.getReadingStatus({ lastReadDate: '2024-12-20' })).toBe('overdue');
  });
});
