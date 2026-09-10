import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import { BadgeArt } from './BadgeIcon';

export default function BadgeIndicators({ count = 0, badges }) {
  const total = count || (badges ? badges.length : 0);
  if (total === 0) return null;

  return (
    <Tooltip title={`${total} badge${total !== 1 ? 's' : ''} earned`}>
      <Chip
        icon={<BadgeArt icon="hidden" size={16} sx={{ ml: 0.5 }} />}
        label={total}
        size="small"
        sx={{
          height: 22,
          fontSize: 11,
          fontWeight: 700,
          backgroundColor: 'rgba(138, 173, 138, 0.18)',
          color: 'primary.dark',
          '& .MuiChip-label': { pl: 0.5, pr: 1 },
        }}
      />
    </Tooltip>
  );
}
