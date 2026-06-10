import React, { useState } from 'react';
import { Box, ButtonBase, Chip, Popover, Typography } from '@mui/material';

const TIER_GRADIENTS = {
  bronze: 'linear-gradient(135deg, #CD7F32, #A0612A)',
  silver: 'linear-gradient(135deg, #C0C0C0, #8A8A8A)',
  gold: 'linear-gradient(135deg, #FFD700, #DAA520)',
  star: 'linear-gradient(135deg, #C2700A, #9B6E3A)',
  single: 'linear-gradient(135deg, #8AAD8A, #6B8E6B)',
};

const TIER_CHIP_COLORS = {
  bronze: '#A0612A',
  silver: '#6E6E6E',
  gold: '#A67C00',
  star: '#C2700A',
};

const CATEGORY_ICONS = {
  bookworm: '📚',
  clock: '⏱',
  sun: '☀️',
  seedling: '🌱',
  flower: '🌸',
  compass: '🔍',
  hidden: '✨',
};

// Badge circle that opens a popover on tap/click — tooltips don't fire on
// touch, and iPads are the primary device. Focusable, so the popover is
// reachable by keyboard and the badge is announced to screen readers.
export default function BadgeIcon({ badge, size = 'medium', showLabel = true }) {
  const [anchorEl, setAnchorEl] = useState(null);

  const sizeMap = { small: 24, medium: 48, large: 64 };
  const px = sizeMap[size] || sizeMap.medium;
  const fontSize = size === 'small' ? 12 : size === 'large' ? 30 : 22;
  const gradient = TIER_GRADIENTS[badge.tier] || TIER_GRADIENTS.single;
  const icon = CATEGORY_ICONS[badge.icon] || '🏆';
  const tierLabel =
    badge.tier === 'single' || !badge.tier
      ? ''
      : badge.tier.charAt(0).toUpperCase() + badge.tier.slice(1);
  const description = badge.description || badge.unlockMessage || '';

  const handleOpen = (event) => {
    // Badges sit inside accordion summaries; don't toggle the accordion too
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  return (
    <>
      <ButtonBase
        component="div"
        role="button"
        onClick={handleOpen}
        aria-label={`${badge.name}${tierLabel ? `, ${tierLabel} tier` : ''}. ${description}`}
        aria-haspopup="true"
        sx={{
          borderRadius: 2,
          p: 0.5,
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          '&.Mui-focusVisible': {
            outline: '2px solid #6B8E6B',
            outlineOffset: 2,
          },
        }}
      >
        <Box
          sx={{
            width: px,
            height: px,
            borderRadius: '50%',
            background: gradient,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize,
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          }}
        >
          {icon}
        </Box>
        {showLabel && size !== 'small' && (
          <>
            <Typography
              variant="caption"
              sx={{
                mt: 0.5,
                fontWeight: 600,
                color: 'text.primary',
                fontSize: 12,
                lineHeight: 1.2,
              }}
            >
              {badge.name}
            </Typography>
            {tierLabel && (
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12 }}>
                {tierLabel}
              </Typography>
            )}
          </>
        )}
      </ButtonBase>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={(event) => {
          event?.stopPropagation?.();
          setAnchorEl(null);
        }}
        onClick={(event) => event.stopPropagation()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{ paper: { sx: { p: 2, maxWidth: 280, borderRadius: 3 } } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: description ? 0.75 : 0 }}>
          <Typography sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, fontSize: 15 }}>
            {badge.name}
          </Typography>
          {tierLabel && (
            <Chip
              label={tierLabel}
              size="small"
              sx={{
                height: 22,
                fontSize: 12,
                fontWeight: 600,
                color: '#fff',
                backgroundColor: TIER_CHIP_COLORS[badge.tier] || '#6B8E6B',
              }}
            />
          )}
        </Box>
        {description && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {description}
          </Typography>
        )}
      </Popover>
    </>
  );
}
