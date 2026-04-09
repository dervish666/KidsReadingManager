import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useJoyride, EVENTS } from 'react-joyride';
import { useUI } from '../../contexts/UIContext';
import { TOURS } from './tourSteps';
import TourTooltip from './TourTooltip';

const TourContext = createContext(null);

export const useTourContext = () => useContext(TourContext);

const TourProvider = ({ children }) => {
  const { completedTours, toursLoaded, markTourComplete } = useUI();
  const [currentTourId, setCurrentTourId] = useState(null);
  const [running, setRunning] = useState(false);

  // Use a ref to read current tourId/version in event handlers without stale closures
  const tourRef = useRef({ tourId: null, version: null });

  // Track whether at least one step was actually shown (tooltip rendered)
  const stepShownRef = useRef(false);

  const currentTour = currentTourId ? TOURS[currentTourId] : null;
  const steps = currentTour
    ? currentTour.steps.map((step) => ({
        ...step,
        skipBeacon: true,
      }))
    : [];

  // Keep ref in sync
  tourRef.current = {
    tourId: currentTourId,
    version: currentTour?.version ?? null,
  };

  const { Tour, on } = useJoyride({
    steps,
    run: running,
    continuous: true,
    showSkipButton: true,
    scrollToFirstStep: true,
    disableOverlayClose: true,
    spotlightClicks: false,
    tooltipComponent: TourTooltip,
    styles: {
      options: {
        zIndex: 1200,
        overlayColor: 'rgba(74, 74, 74, 0.45)',
      },
      spotlight: {
        borderRadius: 12,
      },
    },
  });

  // Track when at least one tooltip is rendered (proves the user saw a step)
  useEffect(() => {
    return on(EVENTS.TOOLTIP, () => {
      stepShownRef.current = true;
    });
  }, [on]);

  // Listen for tour end event — only mark complete if a step was actually shown
  useEffect(() => {
    const unsubscribe = on(EVENTS.TOUR_END, () => {
      const { tourId, version } = tourRef.current;
      const wasShown = stepShownRef.current;

      setRunning(false);
      setCurrentTourId(null);

      if (tourId && version && wasShown) {
        markTourComplete(tourId, version);
      }
    });

    return unsubscribe;
  }, [on, markTourComplete]);

  const startTour = useCallback((tourId) => {
    const tour = TOURS[tourId];
    if (!tour) return;

    // Don't start if any step's target is missing from the DOM —
    // a partial tour (some targets found, some not) gives a broken
    // experience and would wrongly mark the tour as complete.
    const allTargetsExist = tour.steps.every((step) => document.querySelector(step.target));
    if (!allTargetsExist) return;

    stepShownRef.current = false;
    setCurrentTourId(tourId);
    setRunning(true);
  }, []);

  const isTourAvailable = useCallback((tourId) => {
    return !!TOURS[tourId];
  }, []);

  const isTourCompleted = useCallback(
    (tourId) => {
      const tour = TOURS[tourId];
      if (!tour) return true;
      return completedTours[tourId] >= tour.version;
    },
    [completedTours]
  );

  const value = {
    startTour,
    isTourAvailable,
    isTourCompleted,
    toursLoaded,
    running,
    currentTourId,
  };

  return (
    <TourContext.Provider value={value}>
      {children}
      {Tour}
    </TourContext.Provider>
  );
};

export default TourProvider;
