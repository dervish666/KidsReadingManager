import { useEffect, useCallback, useRef } from 'react';
import { useTourContext } from './TourProvider';

export const useTour = (tourId, { ready = true } = {}) => {
  const { startTour, isTourAvailable, isTourCompleted, running, currentTourId } = useTourContext();
  const hasAutoStarted = useRef(false);

  const isCompleted = isTourCompleted(tourId);
  const isAvailable = isTourAvailable(tourId);

  // Auto-start tour on first visit if not completed.
  // hasAutoStarted is set inside the timeout so that if deps change and the
  // timer is cleared, a new timer can start on the next effect run.
  useEffect(() => {
    if (!ready || isCompleted || !isAvailable || hasAutoStarted.current || running) return;

    const timer = setTimeout(() => {
      hasAutoStarted.current = true;
      startTour(tourId);
    }, 500);

    return () => clearTimeout(timer);
  }, [ready, isCompleted, isAvailable, running, startTour, tourId]);

  const handleStartTour = useCallback(() => {
    startTour(tourId);
  }, [startTour, tourId]);

  return {
    startTour: handleStartTour,
    isTourAvailable: isAvailable,
    tourButtonProps: {
      onClick: handleStartTour,
      shouldPulse: !isCompleted && isAvailable,
    },
  };
};
