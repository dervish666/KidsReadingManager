import React, { useEffect, useRef } from 'react';
import { useJoyride, EVENTS } from 'react-joyride';
import TourTooltip from './TourTooltip';

/**
 * The actual Joyride host. Factored out of TourProvider so the ~50KB
 * react-joyride bundle can be code-split — it's only pulled in when a tour
 * is first triggered, not on every app load.
 */
const TourRunner = ({ steps, running, tourId, tourVersion, onTourEnd }) => {
  const stepShownRef = useRef(false);
  const stepsForJoyride = steps.map((step) => ({ ...step, skipBeacon: true }));

  const { Tour, on } = useJoyride({
    steps: stepsForJoyride,
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

  // Reset when a new tour mounts.
  useEffect(() => {
    stepShownRef.current = false;
  }, [tourId]);

  useEffect(() => {
    return on(EVENTS.TOOLTIP, () => {
      stepShownRef.current = true;
    });
  }, [on]);

  useEffect(() => {
    const unsubscribe = on(EVENTS.TOUR_END, () => {
      onTourEnd(tourId, tourVersion, stepShownRef.current);
    });
    return unsubscribe;
  }, [on, onTourEnd, tourId, tourVersion]);

  return Tour;
};

export default TourRunner;
