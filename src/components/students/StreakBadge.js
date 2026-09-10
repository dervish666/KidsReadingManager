import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import WhatshotIcon from '@mui/icons-material/Whatshot';

/**
 * StreakBadge - a student's current reading streak. One flat tint from the
 * theme's streak accent; the flame is an icon so it sits with the rest of the
 * icon set rather than an emoji on an orange gradient.
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
    small: { fontSize: '0.75rem', iconSize: 14, padding: '2px 7px 2px 5px', minWidth: 28 },
    medium: { fontSize: '0.875rem', iconSize: 16, padding: '3px 9px 3px 6px', minWidth: 36 },
    large: { fontSize: '1rem', iconSize: 20, padding: '5px 12px 5px 8px', minWidth: 44 },
  };

  const config = sizeConfig[size] || sizeConfig.medium;

  const tooltipText = streak === 1 ? '1 day reading streak!' : `${streak} day reading streak!`;

  return (
    <Tooltip title={tooltipText} arrow>
      <Box
        aria-label={`${streak} day streak`}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.25,
          padding: config.padding,
          minWidth: config.minWidth,
          borderRadius: '12px',
          backgroundColor: 'accent.streakLight',
          color: 'accent.streak',
          cursor: 'default',
        }}
      >
        <WhatshotIcon sx={{ fontSize: config.iconSize }} />
        <Typography
          component="span"
          sx={{ fontWeight: 700, fontSize: config.fontSize, lineHeight: 1 }}
        >
          {streak}
        </Typography>
        {showLabel && (
          <Typography
            component="span"
            sx={{
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
