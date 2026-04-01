import { describe, it, expect, vi } from 'vitest';

// Mock jsPDF
vi.mock('jspdf', () => {
  function MockJsPDF() {
    this.setFillColor = vi.fn().mockReturnValue(this);
    this.setTextColor = vi.fn().mockReturnValue(this);
    this.setDrawColor = vi.fn().mockReturnValue(this);
    this.setFontSize = vi.fn().mockReturnValue(this);
    this.setFont = vi.fn().mockReturnValue(this);
    this.setLineWidth = vi.fn().mockReturnValue(this);
    this.rect = vi.fn().mockReturnValue(this);
    this.roundedRect = vi.fn().mockReturnValue(this);
    this.text = vi.fn().mockReturnValue(this);
    this.line = vi.fn().mockReturnValue(this);
    this.addPage = vi.fn().mockReturnValue(this);
    this.setPage = vi.fn().mockReturnValue(this);
    this.save = vi.fn();
    this.internal = {
      pageSize: { getWidth: () => 210, getHeight: () => 297 },
      getNumberOfPages: () => 1,
    };
  }
  return { default: MockJsPDF, jsPDF: MockJsPDF };
});

import { generateStatsPDF } from '../../utils/statsExport';

const mockStats = {
  totalStudents: 30,
  totalSessions: 245,
  averageSessionsPerStudent: 8.2,
  studentsWithNoSessions: 3,
  locationDistribution: { home: 120, school: 125 },
  weeklyActivity: { thisWeek: 15, lastWeek: 12 },
  readingByDay: { Sun: 5, Mon: 40, Tue: 38, Wed: 42, Thu: 35, Fri: 30, Sat: 8 },
  studentsWithActiveStreak: 18,
  longestCurrentStreak: 12,
  longestEverStreak: 25,
  averageStreak: 4.5,
  mostReadBooks: [
    { title: 'The Gruffalo', count: 8 },
    { title: 'Room on the Broom', count: 6 },
  ],
  topStreaks: [],
};

describe('generateStatsPDF', () => {
  it('should generate PDF without throwing', () => {
    expect(() =>
      generateStatsPDF({
        schoolName: 'Test School',
        periodLabel: 'All Time',
        dateRange: null,
        stats: mockStats,
        topStreaks: [{ id: '1', name: 'Alice', currentStreak: 12 }],
        needsAttention: [{ id: '2', name: 'Bob', lastReadDate: null }],
      })
    ).not.toThrow();
  });

  it('should handle empty needs attention list', () => {
    expect(() =>
      generateStatsPDF({
        schoolName: 'Test School',
        periodLabel: 'Current Term',
        dateRange: '1 Sep 2025 — 31 Mar 2026',
        stats: mockStats,
        topStreaks: [],
        needsAttention: [],
      })
    ).not.toThrow();
  });
});
