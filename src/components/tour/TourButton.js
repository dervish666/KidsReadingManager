import React from 'react';
import IconButton from '@mui/material/IconButton';
import ExploreOutlinedIcon from '@mui/icons-material/ExploreOutlined';
import { keyframes } from '@mui/material/styles';

const gentlePulse = keyframes`
  0%, 100% { box-shadow: 0 2px 8px rgba(139, 115, 85, 0.1); }
  50% { box-shadow: 0 2px 8px rgba(139, 115, 85, 0.1), 0 0 0 8px rgba(107, 142, 107, 0.1); }
`;

const TourButton = ({ onClick, shouldPulse = false }) => {
  return (
    <IconButton
      onClick={onClick}
      aria-label="Page tour"
      sx={{
        position: 'fixed',
        bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
        right: 16,
        zIndex: 1050,
        width: 40,
        height: 40,
        background: 'rgba(255, 254, 249, 0.95)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(107, 142, 107, 0.2)',
        boxShadow: '0 2px 8px rgba(139, 115, 85, 0.1)',
        color: '#6B8E6B',
        animation: shouldPulse ? `${gentlePulse} 2s ease-in-out infinite` : 'none',
        '&:hover': {
          background: 'rgba(255, 254, 249, 1)',
          border: '1px solid rgba(107, 142, 107, 0.35)',
        },
      }}
    >
      <ExploreOutlinedIcon sx={{ fontSize: 22 }} />
    </IconButton>
  );
};

export default TourButton;
