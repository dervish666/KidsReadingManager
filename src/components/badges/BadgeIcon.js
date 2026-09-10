import React, { useState } from 'react';
import { Box, ButtonBase, Chip, Popover, Typography } from '@mui/material';

// One painted rosette per badge family. Tier is carried by a small coloured
// pip, not by recolouring the artwork: the four Bookworm tiers share one
// rosette, and the pip is what tells them apart at a glance.
import rosetteBookworm from '../../assets/badge-bookworm.webp';
import rosetteClock from '../../assets/badge-clock.webp';
import rosetteSun from '../../assets/badge-sun.webp';
import rosetteSeedling from '../../assets/badge-seedling.webp';
import rosetteFlower from '../../assets/badge-flower.webp';
import rosetteCompass from '../../assets/badge-compass.webp';
import rosetteHidden from '../../assets/badge-hidden.webp';

export const FAMILY_ART = {
  bookworm: rosetteBookworm,
  clock: rosetteClock,
  sun: rosetteSun,
  seedling: rosetteSeedling,
  flower: rosetteFlower,
  compass: rosetteCompass,
  hidden: rosetteHidden,
};

export const TIER_COLORS = {
  bronze: '#A0612A',
  silver: '#6E6E6E',
  gold: '#A67C00',
  star: '#C2700A',
};

export const tierLabelFor = (tier) =>
  !tier || tier === 'single' ? '' : tier.charAt(0).toUpperCase() + tier.slice(1);

const SIZE_PX = { small: 32, medium: 64, large: 96 };

/**
 * Just the artwork: rosette plus optional tier pip. Used by BadgeIcon and by
 * the badge board tiles, which lay out their own labels.
 */
export function BadgeArt({ icon, tier, size = 'medium', earned = true, sx }) {
  const px = typeof size === 'number' ? size : SIZE_PX[size] || SIZE_PX.medium;
  const src = FAMILY_ART[icon] || FAMILY_ART.bookworm;
  const pipColor = TIER_COLORS[tier];
  const pipSize = Math.max(10, Math.round(px * 0.22));

  return (
    <Box
      sx={{
        position: 'relative',
        width: px,
        height: px,
        flex: '0 0 auto',
        filter: earned ? 'none' : 'grayscale(1)',
        opacity: earned ? 1 : 0.4,
        transition: 'filter 0.3s ease, opacity 0.3s ease',
        ...sx,
      }}
    >
      <Box
        component="img"
        src={src}
        alt=""
        aria-hidden="true"
        sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      />
      {pipColor && (
        <Box
          aria-hidden="true"
          sx={{
            position: 'absolute',
            right: Math.round(px * 0.08),
            top: Math.round(px * 0.08),
            width: pipSize,
            height: pipSize,
            borderRadius: '50%',
            backgroundColor: pipColor,
            border: '2px solid #FFFDF7',
            boxShadow: '0 1px 2px rgba(60,40,20,0.25)',
          }}
        />
      )}
    </Box>
  );
}

// Badge that opens a popover on tap/click. Tooltips don't fire on touch, and
// iPads are the primary device. Focusable, so the popover is reachable by
// keyboard and the badge is announced to screen readers.
export default function BadgeIcon({ badge, size = 'medium', showLabel = true, earned = true }) {
  const [anchorEl, setAnchorEl] = useState(null);

  const tierLabel = tierLabelFor(badge.tier);
  const description = badge.description || badge.unlockMessage || '';

  const handleOpen = (event) => {
    // Badges sit inside other clickable rows; don't toggle the parent too
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  return (
    <>
      <ButtonBase
        component="div"
        role="button"
        onClick={handleOpen}
        aria-label={`${badge.name}${tierLabel ? `, ${tierLabel} tier` : ''}${earned ? '' : ', not yet earned'}. ${description}`}
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
        <BadgeArt icon={badge.icon} tier={badge.tier} size={size} earned={earned} />
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
                backgroundColor: TIER_COLORS[badge.tier] || '#6B8E6B',
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
