import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';

/**
 * StreakBadge - Displays a student's reading streak with fire emoji
 *
 * @param {Object} props
 * @param {number} props.streak - Current streak count
 * @param {string} props.size - Badge size: 'small' | 'medium' | 'large'
 * @param {boolean} props.showLabel - Whether to show "day streak" label
 */
const StreakBadge = ({ streak, size = 'medium', showLabel = false }) => {
  if (!streak || streak <= 0) {
    return null;
  }

  const sizeConfig = {
    small: {
      fontSize: '0.75rem',
      emojiSize: '0.875rem',
      padding: '2px 6px',
      minWidth: 28
    },
    medium: {
      fontSize: '0.875rem',
      emojiSize: '1rem',
      padding: '4px 8px',
      minWidth: 36
    },
    large: {
      fontSize: '1rem',
      emojiSize: '1.25rem',
      padding: '6px 12px',
      minWidth: 44
    }
  };

  const config = sizeConfig[size] || sizeConfig.medium;

  const tooltipText = streak === 1
    ? '1 day reading streak!'
    : `${streak} day reading streak!`;

  return (
    <Tooltip title={tooltipText} arrow>
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
          padding: config.padding,
          minWidth: config.minWidth,
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #FF6B35 0%, #F7931E 50%, #FFD700 100%)',
          boxShadow: '0 2px 8px rgba(255, 107, 53, 0.3)',
          cursor: 'default',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          '&:hover': {
            transform: 'scale(1.05)',
            boxShadow: '0 4px 12px rgba(255, 107, 53, 0.4)',
          }
        }}
      >
        <Typography
          component="span"
          sx={{
            fontSize: config.emojiSize,
            lineHeight: 1,
          }}
        >
          🔥
        </Typography>
        <Typography
          component="span"
          sx={{
            color: 'white',
            fontWeight: 700,
            fontSize: config.fontSize,
            lineHeight: 1,
            textShadow: '0 1px 2px rgba(0,0,0,0.2)',
          }}
        >
          {streak}
        </Typography>
        {showLabel && (
          <Typography
            component="span"
            sx={{
              color: 'rgba(255,255,255,0.9)',
              fontWeight: 500,
              fontSize: `calc(${config.fontSize} * 0.85)`,
              lineHeight: 1,
              ml: 0.25,
            }}
          >
            {streak === 1 ? 'day' : 'days'}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
};

export default StreakBadge;
