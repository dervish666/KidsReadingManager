import React from 'react';
import { Box, Chip, Tooltip } from '@mui/material';

export default function BadgeIndicators({ badges = [], maxVisible = 4 }) {
  if (!badges || badges.length === 0) return null;

  const visible = badges.slice(0, maxVisible);
  const remaining = badges.length - maxVisible;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {/* Garden count chip */}
      <Tooltip title={`${badges.length} badge${badges.length !== 1 ? 's' : ''} earned`}>
        <Chip
          label={`🌿 ${badges.length}`}
          size="small"
          sx={{
            height: 22,
            fontSize: 11,
            fontWeight: 600,
            background: 'linear-gradient(135deg, #86A86B, #6B8F50)',
            color: 'white',
            '& .MuiChip-label': { px: 1 },
          }}
        />
      </Tooltip>
    </Box>
  );
}
