import React from 'react';
import { Box } from '@mui/material';
import ReadingFrequencyChart from './ReadingFrequencyChart';

// The chart is one row per pupil with the session count on the right, which is
// exactly what the "Reading Frequency Details" list beneath it used to repeat.
export default function FrequencyTab() {
  return (
    <Box>
      <ReadingFrequencyChart />
    </Box>
  );
}
