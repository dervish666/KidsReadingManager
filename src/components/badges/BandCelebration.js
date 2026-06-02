import React from 'react';
import { Dialog, DialogContent, Box, Typography, Button } from '@mui/material';

/**
 * Shown when a child climbs a reading band.
 * `bandUp` = { from: {name,color,textColor}, to: {name,color,textColor} }.
 */
export default function BandCelebration({ bandUp, studentName, onClose }) {
  if (!bandUp) return null;
  const { from, to } = bandUp;
  return (
    <Dialog
      open={!!bandUp}
      onClose={onClose}
      aria-labelledby="band-celebration-title"
      PaperProps={{
        sx: {
          borderRadius: 3,
          background: 'linear-gradient(135deg, #F5EFD6, #E8F5E2)',
          border: '1px solid #D4DEBC',
          maxWidth: 340,
        },
      }}
    >
      <DialogContent sx={{ textAlign: 'center', py: 3, px: 3 }}>
        <Typography sx={{ fontSize: 40, mb: 1 }}>🎉</Typography>
        <Typography
          id="band-celebration-title"
          variant="h6"
          sx={{ fontWeight: 600, color: '#3D3427', mb: 2 }}
        >
          {studentName ? `${studentName} moved up a band!` : 'New reading band!'}
        </Typography>
        <Box
          sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', alignItems: 'center', mb: 1 }}
        >
          <BandPill band={from} />
          <Typography sx={{ fontSize: 22, color: '#86A86B' }}>→</Typography>
          <BandPill band={to} big />
        </Box>
        <Typography
          variant="body2"
          sx={{ color: '#5D6B4A', mt: 2, maxWidth: 250, mx: 'auto', lineHeight: 1.5 }}
        >
          Now on the <strong>{to.name}</strong> band — keep it up!
        </Typography>
        <Button
          onClick={onClose}
          variant="contained"
          sx={{
            mt: 2.5,
            background: '#86A86B',
            '&:hover': { background: '#6B8F50' },
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 500,
          }}
        >
          Lovely!
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function BandPill({ band, big = false }) {
  return (
    <Box
      component="span"
      sx={{
        bgcolor: band.color,
        color: band.textColor,
        border: '1px solid rgba(0,0,0,0.15)',
        borderRadius: 999,
        px: big ? 2 : 1.5,
        py: big ? 0.75 : 0.5,
        fontWeight: 700,
        fontSize: big ? 16 : 13,
      }}
    >
      {band.name}
    </Box>
  );
}
