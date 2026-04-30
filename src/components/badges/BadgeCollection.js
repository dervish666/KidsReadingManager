import React from 'react';
import { Box, LinearProgress, Typography } from '@mui/material';
import BadgeIcon from './BadgeIcon';
import GardenHeader from './GardenHeader';

export default function BadgeCollection({ studentName, badges = [], nearMisses = [], _stats }) {
  const earned = badges || [];
  const hasAny = earned.length > 0 || nearMisses.length > 0;

  return (
    <Box>
      <GardenHeader badgeCount={earned.length} studentName={studentName} />

      <Box sx={{ p: 2 }}>
        {/* Earned badges */}
        {earned.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1, color: '#3D3427' }}>
              Earned
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5, mb: 2 }}>
              {earned.map((b) => (
                <BadgeIcon
                  key={b.badgeId}
                  badge={{
                    ...b,
                    // Look up display info from definitions
                    name: b.name || b.badgeId,
                    icon: b.icon || 'bookworm',
                  }}
                  size="medium"
                />
              ))}
            </Box>
          </>
        )}

        {/* Near misses */}
        {nearMisses.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1, color: '#3D3427' }}>
              Almost there
            </Typography>
            {nearMisses.map((nm) => (
              <Box
                key={nm.badgeId}
                sx={{
                  background: '#FFF8EE',
                  borderRadius: 2,
                  p: 1.5,
                  mb: 1,
                  border: '1px solid #F0E4CC',
                }}
              >
                <Box
                  sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: 18, opacity: 0.5 }}>{nm.icon || '🏆'}</Typography>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: '#3D3427' }}>
                        {nm.name} {nm.tier !== 'single' ? `(${nm.tier})` : ''}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#8B7E6A' }}>
                        {nm.remaining} more to go!
                      </Typography>
                    </Box>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#86A86B' }}>
                    {nm.current}/{nm.target}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, (nm.current / nm.target) * 100)}
                  sx={{
                    mt: 1,
                    height: 6,
                    borderRadius: 1,
                    backgroundColor: '#E8DFD0',
                    '& .MuiLinearProgress-bar': {
                      background: 'linear-gradient(90deg, #86A86B, #A0C484)',
                      borderRadius: 1,
                    },
                  }}
                />
              </Box>
            ))}
          </>
        )}

        {/* Empty state */}
        {!hasAny && (
          <Box sx={{ textAlign: 'center', py: 3, color: '#8B7E6A' }}>
            <Typography variant="body2">
              No badges earned yet. Every reading session helps the garden grow!
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
