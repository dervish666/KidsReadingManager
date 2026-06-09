import React from 'react';
import { Box } from '@mui/material';
import TopBooksCard from './TopBooksCard';

/**
 * Reading Noticeboard — a compact celebratory strip shown atop the Students
 * (landing) tab. Phase 1 holds the Top Books card; later phases add a
 * literary-events calendar and a weekly reading-news feed alongside it, all
 * fed from the static `public/reading-feed.json` published by the feed skill.
 */
export default function NoticeboardStrip() {
  return (
    <Box sx={{ mb: { xs: 1, sm: 2 } }}>
      <TopBooksCard />
    </Box>
  );
}
