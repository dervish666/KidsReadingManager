import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { getBandByIndex } from '../../utils/readingBandDefinitions';
import { bandForCount } from '../../utils/readingBandEngine';

/** Small coloured band chip for cards/tables. */
export function ReadingBandChip({ bandIndex = 0, size = 'small', bands }) {
  const band = getBandByIndex(bandIndex, bands);
  const pad = size === 'small' ? '2px 8px' : '4px 12px';
  const font = size === 'small' ? 11 : 13;
  return (
    <Tooltip title={`Reading band: ${band.name}`}>
      <Box
        component="span"
        sx={{
          display: 'inline-block',
          bgcolor: band.color,
          color: band.textColor,
          border: '1px solid rgba(0,0,0,0.12)',
          borderRadius: 999,
          padding: pad,
          fontSize: font,
          fontWeight: 700,
          lineHeight: 1.4,
          whiteSpace: 'nowrap',
        }}
      >
        {band.name}
      </Box>
    </Tooltip>
  );
}

/** Band + progress-to-next bar for profile/parent surfaces. */
export function ReadingBandProgress({ readsCount = 0, readsPerBand = 20, bands }) {
  const band = bandForCount(readsCount, readsPerBand, bands);
  const within = band.atTop ? readsPerBand : readsPerBand - band.toNext;
  const pct = band.atTop ? 100 : Math.round((within / readsPerBand) * 100);
  return (
    <Box>
      <ReadingBandChip bandIndex={band.index} size="medium" bands={bands} />
      <Box sx={{ height: 8, bgcolor: 'grey.200', borderRadius: 1, overflow: 'hidden', mt: 0.75 }}>
        <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: band.color, borderRadius: 1 }} />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
        {band.atTop
          ? `${readsCount} reads this year — top band reached! 🎉`
          : `${readsCount} reads this year · ${band.toNext} to ${getBandByIndex(band.index + 1, bands).name}`}
      </Typography>
    </Box>
  );
}

export default ReadingBandChip;
