import React from 'react';
import { Box, Chip, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import {
  enabledObservations,
  emptyObservations,
  observationsFromSession,
  DEFAULT_OBSERVATION_CONFIG,
} from '../../utils/readingObservations';

// Re-exported so existing imports (SessionForm, StudentTimeline) keep working.
export { emptyObservations, observationsFromSession };

/**
 * Tappable chip row for the per-session reading observations
 * ("how did they read today?"). Which chips appear is driven by the school's
 * configuration — pass the enabled slots via `observations`; falls back to the
 * built-in defaults when none are provided.
 *
 * @param {{ [key: string]: boolean }} values        current tick state, keyed by observation key
 * @param {(next) => void} onChange                   receives the full updated values object
 * @param {Array<{key,label}>} [observations]         enabled slots to render
 * @param {string} [label]                            caption shown above the chips (pass null to hide)
 */
const ReadingObservationToggles = ({
  values,
  onChange,
  observations,
  label = 'How did they read today?',
}) => {
  const items =
    observations && observations.length >= 0
      ? observations
      : enabledObservations(DEFAULT_OBSERVATION_CONFIG);

  const toggle = (key) => onChange({ ...values, [key]: !values[key] });

  // Nothing to show if the school has switched every observation off.
  if (!items.length) return null;

  return (
    <Box>
      {label && (
        <Typography
          variant="caption"
          sx={{ display: 'block', mb: 0.75, color: 'text.secondary', fontStyle: 'italic' }}
        >
          {label}{' '}
          <Box component="span" sx={{ opacity: 0.7 }}>
            (optional)
          </Box>
        </Typography>
      )}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {items.map(({ key, label: chipLabel }) => {
          const active = !!values?.[key];
          return (
            <Chip
              key={key}
              label={chipLabel}
              icon={active ? <CheckIcon /> : undefined}
              onClick={() => toggle(key)}
              role="button"
              aria-pressed={active}
              color={active ? 'primary' : 'default'}
              variant={active ? 'filled' : 'outlined'}
              sx={{
                height: 40,
                borderRadius: 3,
                fontWeight: active ? 600 : 400,
                '& .MuiChip-label': { px: 1.25 },
              }}
            />
          );
        })}
      </Box>
    </Box>
  );
};

export default ReadingObservationToggles;
