import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  lazy,
  Suspense,
} from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { TOURS } from './tourSteps';
import TourTooltip from './TourTooltip';

const Joyride = lazy(() => import('react-joyride'));

const TourContext = createContext(null);

export const useTourContext = () => useContext(TourContext);

const TourProvider = ({ children }) => {
  const { completedTours, markTourComplete } = useAppContext();
  const [currentTourId, setCurrentTourId] = useState(null);
  const [running, setRunning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [joyrideLoaded, setJoyrideLoaded] = useState(false);

  const currentTour = currentTourId ? TOURS[currentTourId] : null;
  const steps = currentTour
    ? currentTour.steps.map((step) => ({
        ...step,
        disableBeacon: true,
      }))
    : [];

  const startTour = useCallback((tourId) => {
    if (!TOURS[tourId]) return;
    setCurrentTourId(tourId);
    setStepIndex(0);
    setRunning(true);
    setJoyrideLoaded(true);
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
      const { status, type, index } = data;

      if (type === 'step:after') {
        setStepIndex(index + 1);
      }

      if (status === 'finished' || status === 'skipped') {
        setRunning(false);
        setCurrentTourId(null);
        if (currentTour) {
          markTourComplete(currentTourId, currentTour.version);
        }
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
      {joyrideLoaded && (
        <Suspense fallback={null}>
          <Joyride
            steps={steps}
            run={running}
            stepIndex={stepIndex}
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
            floaterProps={{
              disableAnimation: true,
            }}
          />
        </Suspense>
      )}
    </TourContext.Provider>
  );
};

export default TourProvider;
