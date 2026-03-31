import { describe, it, expect } from 'vitest';
import { TOURS } from '../../components/tour/tourSteps';

describe('TOURS', () => {
  it('defines tours for all v1 pages', () => {
    expect(TOURS).toHaveProperty('students');
    expect(TOURS).toHaveProperty('session-form');
    expect(TOURS).toHaveProperty('home-reading-quick');
    expect(TOURS).toHaveProperty('home-reading');
    expect(TOURS).toHaveProperty('recommendations');
    expect(TOURS).toHaveProperty('stats');
  });

  it('each tour has a version and non-empty steps array', () => {
    Object.entries(TOURS).forEach(([tourId, tour]) => {
      expect(tour.version).toBeGreaterThan(0);
      expect(tour.steps.length).toBeGreaterThan(0);
      expect(tour.steps.length).toBeLessThanOrEqual(5);
    });
  });

  it('each step has target, title, and content', () => {
    Object.entries(TOURS).forEach(([tourId, tour]) => {
      tour.steps.forEach((step, i) => {
        expect(step.target, `${tourId} step ${i} missing target`).toBeTruthy();
        expect(step.title, `${tourId} step ${i} missing title`).toBeTruthy();
        expect(step.content, `${tourId} step ${i} missing content`).toBeTruthy();
        expect(step.target).toMatch(/^\[data-tour="/);
      });
    });
  });
});
