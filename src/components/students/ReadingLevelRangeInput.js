import React from 'react';
import { Box, TextField, Typography } from '@mui/material';

/**
 * Reading level range input with visual bar
 * @param {Object} props
 * @param {number|null} props.min - Minimum reading level (1.0-13.0)
 * @param {number|null} props.max - Maximum reading level (1.0-13.0)
 * @param {Function} props.onChange - Called with {min, max} when values change
 * @param {boolean} props.disabled - Whether inputs are disabled
 */
export default function ReadingLevelRangeInput({ min, max, onChange, disabled = false }) {
  const handleMinChange = (e) => {
    const value = e.target.value === '' ? null : parseFloat(e.target.value);
    onChange({ min: value, max });
  };

  const handleMaxChange = (e) => {
    const value = e.target.value === '' ? null : parseFloat(e.target.value);
    onChange({ min, max: value });
  };

  const hasError = min !== null && max !== null && min > max;
  const isNotAssessed = min === null && max === null;

  // Calculate visual bar position (percentage of 1-13 range)
  const minPercent = min !== null ? ((min - 1) / 12) * 100 : 0;
  const maxPercent = max !== null ? ((max - 1) / 12) * 100 : 0;
  const rangeWidth = max !== null && min !== null ? maxPercent - minPercent : 0;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
        <TextField
          label="Min Level"
          type="number"
          inputProps={{
            min: 1.0,
            max: 13.0,
            step: 0.1,
            'aria-label': 'Minimum reading level'
          }}
          value={min ?? ''}
          onChange={handleMinChange}
          disabled={disabled}
          size="small"
          sx={{ width: 120 }}
          error={hasError}
        />
        <TextField
          label="Max Level"
          type="number"
          inputProps={{
            min: 1.0,
            max: 13.0,
            step: 0.1,
            'aria-label': 'Maximum reading level'
          }}
          value={max ?? ''}
          onChange={handleMaxChange}
          disabled={disabled}
          size="small"
          sx={{ width: 120 }}
          error={hasError}
        />
      </Box>

      {hasError && (
        <Typography color="error" variant="caption" sx={{ mb: 1, display: 'block' }}>
          Minimum cannot be greater than maximum
        </Typography>
      )}

      {isNotAssessed ? (
        <Typography variant="caption" color="text.secondary">
          Not assessed
        </Typography>
      ) : (
        <Box data-testid="reading-level-range-bar" sx={{ position: 'relative', mt: 1 }}>
          {/* Scale labels */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">1.0</Typography>
            <Typography variant="caption" color="text.secondary">13.0</Typography>
          </Box>

          {/* Background bar */}
          <Box
            sx={{
              height: 8,
              bgcolor: 'grey.200',
              borderRadius: 1,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Filled range */}
            {!hasError && min !== null && max !== null && (
              <Box
                sx={{
                  position: 'absolute',
                  left: `${minPercent}%`,
                  width: `${rangeWidth}%`,
                  height: '100%',
                  bgcolor: 'primary.main',
                  borderRadius: 1,
                }}
              />
            )}
          </Box>

          {/* Range display */}
          {min !== null && max !== null && !hasError && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Range: {min.toFixed(1)} - {max.toFixed(1)}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
