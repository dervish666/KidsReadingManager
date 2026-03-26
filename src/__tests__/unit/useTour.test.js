import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockStartTour = vi.fn();
const mockIsTourAvailable = vi.fn().mockReturnValue(true);
const mockIsTourCompleted = vi.fn().mockReturnValue(false);

vi.mock('../../components/tour/TourProvider', () => ({
  useTourContext: () => ({
    startTour: mockStartTour,
    isTourAvailable: mockIsTourAvailable,
    isTourCompleted: mockIsTourCompleted,
    running: false,
    currentTourId: null,
  }),
}));

import { useTour } from '../../components/tour/useTour';

describe('useTour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns tourButtonProps with onClick and shouldPulse', () => {
    const { result } = renderHook(() => useTour('students'));
    expect(result.current.tourButtonProps).toBeDefined();
    expect(result.current.tourButtonProps.onClick).toBeInstanceOf(Function);
    expect(typeof result.current.tourButtonProps.shouldPulse).toBe('boolean');
  });

  it('sets shouldPulse to true when tour not completed', () => {
    mockIsTourCompleted.mockReturnValue(false);
    const { result } = renderHook(() => useTour('students'));
    expect(result.current.tourButtonProps.shouldPulse).toBe(true);
  });

  it('sets shouldPulse to false when tour completed', () => {
    mockIsTourCompleted.mockReturnValue(true);
    const { result } = renderHook(() => useTour('students'));
    expect(result.current.tourButtonProps.shouldPulse).toBe(false);
  });

  it('does not auto-start when ready is false', () => {
    mockIsTourCompleted.mockReturnValue(false);
    renderHook(() => useTour('students', { ready: false }));
    expect(mockStartTour).not.toHaveBeenCalled();
  });
});
