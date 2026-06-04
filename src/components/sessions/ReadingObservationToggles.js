import React from 'react';
import { Box, Chip, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';

/**
 * The three optional reading observations a teacher can record on a session
 * ("how did they read today?"). Independent on/off flags — none are required and
 * any combination is valid. Keys match the API/DB field names.
 */
export const READING_OBSERVATIONS = [
  { key: 'readFluent', label: 'Fluent & confident' },
  { key: 'readExpressive', label: 'Engaging & expressive' },
  { key: 'readPhonics', label: 'Reliant on phonics' },
];

/** Empty observation state — all unticked. */
export const emptyObservations = () => ({
  readFluent: false,
  readExpressive: false,
  readPhonics: false,
});

/** Pull just the observation fields out of a session object as booleans. */
export const observationsFromSession = (session = {}) => ({
  readFluent: !!session.readFluent,
  readExpressive: !!session.readExpressive,
  readPhonics: !!session.readPhonics,
});

/**
 * Tappable chip row for the three reading observations.
 *
 * @param {{ readFluent: boolean, readExpressive: boolean, readPhonics: boolean }} values
 * @param {(next) => void} onChange  receives the full updated values object
 * @param {string} [label]           caption shown above the chips (pass null to hide)
 */
const ReadingObservationToggles = ({ values, onChange, label = 'How did they read today?' }) => {
  const toggle = (key) => onChange({ ...values, [key]: !values[key] });

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
        {READING_OBSERVATIONS.map(({ key, label: chipLabel }) => {
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
