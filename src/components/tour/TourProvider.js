import React, {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { useUI } from '../../contexts/UIContext';
import { TOURS } from './tourSteps';

// react-joyride (~50KB) is only imported when a tour actually starts.
// Outside that, the bundle doesn't pay for it.
const TourRunner = lazy(() => import('./TourRunner'));

const TourContext = createContext(null);

export const useTourContext = () => useContext(TourContext);

const TourProvider = ({ children }) => {
  const { completedTours, toursLoaded, markTourComplete } = useUI();
  const [currentTourId, setCurrentTourId] = useState(null);
  const [running, setRunning] = useState(false);

  const currentTour = currentTourId ? TOURS[currentTourId] : null;

  const startTour = useCallback((tourId) => {
    const tour = TOURS[tourId];
    if (!tour) return;

    // Don't start if any step's target is missing from the DOM — a partial
    // tour (some targets found, some not) gives a broken experience and
    // would wrongly mark the tour as complete.
    const allTargetsExist = tour.steps.every((step) => document.querySelector(step.target));
    if (!allTargetsExist) return;

    setCurrentTourId(tourId);
    setRunning(true);
  }, []);

  const isTourAvailable = useCallback((tourId) => !!TOURS[tourId], []);

  const isTourCompleted = useCallback(
    (tourId) => {
      const tour = TOURS[tourId];
      if (!tour) return true;
      return completedTours[tourId] >= tour.version;
    },
    [completedTours]
  );

  // Called by the lazily-mounted TourRunner when Joyride emits TOUR_END.
  const handleTourEnd = useCallback(
    (tourId, version, stepShown) => {
      setRunning(false);
      setCurrentTourId(null);
      if (tourId && version && stepShown) {
        markTourComplete(tourId, version);
      }
    },
    [markTourComplete]
  );

  const value = useMemo(
    () => ({
      startTour,
      isTourAvailable,
      isTourCompleted,
      toursLoaded,
      running,
      currentTourId,
    }),
    [startTour, isTourAvailable, isTourCompleted, toursLoaded, running, currentTourId]
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {running && currentTour && (
        <Suspense fallback={null}>
          <TourRunner
            steps={currentTour.steps}
            running={running}
            tourId={currentTourId}
            tourVersion={currentTour.version}
            onTourEnd={handleTourEnd}
          />
        </Suspense>
      )}
    </TourContext.Provider>
  );
};

export default TourProvider;
