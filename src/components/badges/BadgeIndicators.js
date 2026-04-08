import React from 'react';
import { Chip, Tooltip } from '@mui/material';

export default function BadgeIndicators({ count = 0, badges }) {
  const total = count || (badges ? badges.length : 0);
  if (total === 0) return null;

  return (
    <Tooltip title={`${total} badge${total !== 1 ? 's' : ''} earned`}>
      <Chip
        label={`🌿 ${total}`}
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
  );
}
