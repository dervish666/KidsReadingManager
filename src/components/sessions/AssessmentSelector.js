import React from 'react';
import { Box, Slider, Typography } from '@mui/material';

const marks = Array.from({ length: 10 }, (_, i) => ({ value: i + 1 }));

const AssessmentSelector = ({ value, onChange }) => {
  const isUnset = value === null || value === undefined;

  const handleChange = (event, newValue) => {
    onChange(newValue);
  };

  return (
    <Box sx={{ width: '100%', px: 1 }}>
      {isUnset ? (
        <Box
          sx={{
            position: 'relative',
            cursor: 'pointer',
          }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const ratio = x / rect.width;
            const val = Math.round(ratio * 9) + 1;
            onChange(Math.max(1, Math.min(10, val)));
          }}
        >
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              textAlign: 'center',
              color: 'text.secondary',
              mb: 0.5,
              fontStyle: 'italic',
            }}
          >
            Tap to set reading assessment
          </Typography>
          <Slider
            value={5}
            min={1}
            max={10}
            step={1}
            marks={marks}
            disabled
            sx={{
              '& .MuiSlider-thumb': { display: 'none' },
              '& .MuiSlider-track': { bgcolor: 'grey.300' },
              '& .MuiSlider-rail': { bgcolor: 'grey.200' },
              '& .MuiSlider-mark': { bgcolor: 'grey.300' },
              pointerEvents: 'none',
            }}
          />
        </Box>
      ) : (
        <Slider
          value={value}
          onChange={handleChange}
          min={1}
          max={10}
          step={1}
          marks={marks}
          valueLabelDisplay="auto"
          sx={{
            '& .MuiSlider-thumb': {
              width: 24,
              height: 24,
            },
          }}
        />
      )}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: -0.5 }}>
        <Typography variant="caption" color="text.secondary">
          Needing Help
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Independent
        </Typography>
      </Box>
    </Box>
  );
};

export default AssessmentSelector;
