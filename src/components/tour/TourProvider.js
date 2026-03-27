import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useJoyride, EVENTS } from 'react-joyride';
import { useUI } from '../../contexts/UIContext';
import { TOURS } from './tourSteps';
import TourTooltip from './TourTooltip';

const TourContext = createContext(null);

export const useTourContext = () => useContext(TourContext);

const TourProvider = ({ children }) => {
  const { completedTours, markTourComplete } = useUI();
  const [currentTourId, setCurrentTourId] = useState(null);
  const [running, setRunning] = useState(false);

  // Use a ref to read current tourId/version in event handlers without stale closures
  const tourRef = useRef({ tourId: null, version: null });

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

  // Listen for tour end event
  useEffect(() => {
    const unsubscribe = on(EVENTS.TOUR_END, () => {
      const { tourId, version } = tourRef.current;
      setRunning(false);
      setCurrentTourId(null);
      if (tourId && version) {
        markTourComplete(tourId, version);
      }
    });

    return unsubscribe;
  }, [on, markTourComplete]);

  const startTour = useCallback((tourId) => {
    if (!TOURS[tourId]) return;
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
