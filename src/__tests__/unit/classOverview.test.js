import { describe, it, expect } from 'vitest';
import { resolveTeacherClasses, summariseClass } from '../../utils/classOverview.js';

const classes = [
  { id: 'c1', name: '3E', teacherNames: ['Frances Easton'], isActive: true },
  { id: 'c2', name: '3PP', teacherNames: ['Lisa Passingham', 'Sarah Peasey'], isActive: true },
  { id: 'c3', name: 'Old 3E', teacherNames: ['Frances Easton'], isActive: false },
  { id: 'c4', name: 'Manual', teacherName: 'Sam Castillo', isActive: true },
];

describe('resolveTeacherClasses', () => {
  it('prefers the Wonde-assigned class ids stamped in the JWT', () => {
    const r = resolveTeacherClasses({ name: 'Frances Easton', assignedClassIds: ['c2'] }, classes);
    expect(r.via).toBe('assigned');
    expect(r.classes.map((c) => c.id)).toEqual(['c2']);
  });

  it('falls back to matching the synced teacher name, ignoring case and retired classes', () => {
    const r = resolveTeacherClasses({ name: 'frances  EASTON' }, classes);
    expect(r.via).toBe('name');
    expect(r.classes.map((c) => c.id)).toEqual(['c1']);
  });

  it('matches a typed teacher name on a manual class', () => {
    const r = resolveTeacherClasses({ name: 'Sam Castillo' }, classes);
    expect(r.classes.map((c) => c.id)).toEqual(['c4']);
  });

  it('returns none when assigned ids point at classes that no longer exist and the name matches nothing', () => {
    const r = resolveTeacherClasses({ name: 'Nobody', assignedClassIds: ['gone'] }, classes);
    expect(r).toEqual({ classes: [], via: 'none' });
  });
});

describe('summariseClass', () => {
  const today = '2026-09-04';
  const status = (s) => {
    if (!s.lastReadDate) return 'never';
    const days = (Date.parse(today) - Date.parse(s.lastReadDate)) / 86400000;
    if (days <= 14) return 'recent';
    if (days <= 45) return 'attention';
    return 'overdue';
  };
  const students = [
    { id: 1, name: 'Ada', classId: 'c1', lastReadDate: '2026-09-04', currentStreak: 3 },
    { id: 2, name: 'Ben', classId: 'c1', lastReadDate: '2026-09-01', currentStreak: 0 },
    { id: 3, name: 'Cal', classId: 'c1', lastReadDate: '2026-08-01', currentStreak: 0 },
    { id: 4, name: 'Dee', classId: 'c1', lastReadDate: '2026-06-01', currentStreak: 0 },
    { id: 5, name: 'Eve', classId: 'c1', lastReadDate: null, currentStreak: 0 },
    { id: 6, name: 'Fay', classId: 'c1', lastReadDate: '2026-09-03', currentStreak: 7 },
    { id: 7, name: 'Gus', classId: 'c2', lastReadDate: null },
    { id: 8, name: 'Hal', classId: 'c1', lastReadDate: null, isActive: false },
  ];

  it('counts only active pupils in the class', () => {
    const s = summariseClass({ students, classId: 'c1', getReadingStatus: status, today });
    expect(s.pupils).toBe(6);
  });

  it('splits reads by today, this week and status', () => {
    const s = summariseClass({ students, classId: 'c1', getReadingStatus: status, today });
    expect(s.readToday).toBe(1);
    expect(s.readThisWeek).toBe(3); // Ada, Ben, Fay
    expect(s.status).toEqual({ recent: 3, attention: 1, overdue: 1, never: 1 });
  });

  it('reports streaks and the longest holder', () => {
    const s = summariseClass({ students, classId: 'c1', getReadingStatus: status, today });
    expect(s.activeStreaks).toBe(2);
    expect(s.longestStreak).toEqual({ name: 'Fay', days: 7 });
  });

  it('lists the pupils to catch up with, never-read first then longest wait', () => {
    const s = summariseClass({ students, classId: 'c1', getReadingStatus: status, today });
    expect(s.catchUp.map((p) => p.name)).toEqual(['Eve', 'Dee']);
    expect(s.catchUpTotal).toBe(2);
  });

  it('caps the catch-up list but keeps the true total', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      id: i,
      name: `P${i}`,
      classId: 'c9',
      lastReadDate: null,
    }));
    const s = summariseClass({ students: many, classId: 'c9', getReadingStatus: status, today });
    expect(s.catchUp).toHaveLength(5);
    expect(s.catchUpTotal).toBe(9);
  });

  it('is empty, not broken, for a class with no pupils', () => {
    const s = summariseClass({ students, classId: 'empty', getReadingStatus: status, today });
    expect(s.pupils).toBe(0);
    expect(s.longestStreak).toBeNull();
    expect(s.catchUp).toEqual([]);
  });
});
