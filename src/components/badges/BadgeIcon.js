import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';

const TIER_GRADIENTS = {
  bronze: 'linear-gradient(135deg, #CD7F32, #A0612A)',
  silver: 'linear-gradient(135deg, #C0C0C0, #8A8A8A)',
  gold: 'linear-gradient(135deg, #FFD700, #DAA520)',
  star: 'linear-gradient(135deg, #9B59B6, #7D3C98)',
  single: 'linear-gradient(135deg, #86A86B, #6B8F50)',
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

export default function BadgeIcon({ badge, size = 'medium', showLabel = true }) {
  const sizeMap = { small: 24, medium: 48, large: 64 };
  const px = sizeMap[size] || sizeMap.medium;
  const fontSize = size === 'small' ? 12 : size === 'large' ? 30 : 22;
  const gradient = TIER_GRADIENTS[badge.tier] || TIER_GRADIENTS.single;
  const icon = CATEGORY_ICONS[badge.icon] || '🏆';
  const tierLabel = badge.tier === 'single' ? '' : badge.tier.charAt(0).toUpperCase() + badge.tier.slice(1);

  return (
    <Tooltip title={`${badge.name}${tierLabel ? ` (${tierLabel})` : ''} — ${badge.description || badge.unlockMessage || ''}`}>
      <Box sx={{ textAlign: 'center', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
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
            <Typography variant="caption" sx={{ mt: 0.5, fontWeight: 500, color: '#3D3427', fontSize: 10, lineHeight: 1.2 }}>
              {badge.name}
            </Typography>
            {tierLabel && (
              <Typography variant="caption" sx={{ color: '#8B7E6A', fontSize: 9 }}>
                {tierLabel}
              </Typography>
            )}
          </>
        )}
      </Box>
    </Tooltip>
  );
}
