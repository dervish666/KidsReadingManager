import React, { createContext, useContext, useState, useCallback } from 'react';
import { Joyride, STATUS } from 'react-joyride';
import { useAppContext } from '../../contexts/AppContext';
import { TOURS } from './tourSteps';
import TourTooltip from './TourTooltip';

const TourContext = createContext(null);

export const useTourContext = () => useContext(TourContext);

const TourProvider = ({ children }) => {
  const { completedTours, markTourComplete } = useAppContext();
  const [currentTourId, setCurrentTourId] = useState(null);
  const [running, setRunning] = useState(false);

  const currentTour = currentTourId ? TOURS[currentTourId] : null;
  const steps = currentTour
    ? currentTour.steps.map((step) => ({
        ...step,
        skipBeacon: true,
      }))
    : [];

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

  const handleJoyrideCallback = useCallback(
    (data) => {
      const { status } = data;

      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        setRunning(false);
        if (currentTour && currentTourId) {
          markTourComplete(currentTourId, currentTour.version);
        }
        setCurrentTourId(null);
      }
    },
    [currentTourId, currentTour, markTourComplete]
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
      <Joyride
        steps={steps}
        run={running}
        continuous
        showSkipButton
        scrollToFirstStep
        disableOverlayClose
        spotlightClicks={false}
        tooltipComponent={TourTooltip}
        callback={handleJoyrideCallback}
        styles={{
          options: {
            zIndex: 1200,
            overlayColor: 'rgba(74, 74, 74, 0.45)',
          },
          spotlight: {
            borderRadius: 12,
          },
        }}
      />
    </TourContext.Provider>
  );
};

export default TourProvider;
