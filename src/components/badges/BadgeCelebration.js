import React from 'react';
import { Dialog, DialogContent, Box, Typography, Button } from '@mui/material';
import BadgeIcon from './BadgeIcon';

export default function BadgeCelebration({ badges = [], onClose }) {
  if (!badges || badges.length === 0) return null;
  const badge = badges[0]; // Show first badge; if multiple, cycle or show summary

  return (
    <Dialog
      open={badges.length > 0}
      onClose={onClose}
      PaperProps={{
        sx: {
          borderRadius: 3,
          background: 'linear-gradient(135deg, #F5EFD6, #E8F5E2)',
          border: '1px solid #D4DEBC',
          maxWidth: 320,
        },
      }}
    >
      <DialogContent sx={{ textAlign: 'center', py: 3, px: 3 }}>
        <Typography sx={{ fontSize: 40, mb: 1 }}>🌸</Typography>
        <Typography variant="h6" sx={{ fontWeight: 600, color: '#3D3427', mb: 2 }}>
          {badges.length > 1 ? `${badges.length} new badges earned!` : 'New badge earned!'}
        </Typography>
        <BadgeIcon badge={badge} size="large" showLabel />
        <Typography
          variant="body2"
          sx={{ color: '#5D6B4A', mt: 2, maxWidth: 240, mx: 'auto', lineHeight: 1.5 }}
        >
          {badge.unlockMessage}
        </Typography>
        {badges.length > 1 && (
          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center', mt: 1.5 }}>
            {badges.slice(1).map((b) => (
              <BadgeIcon key={b.id} badge={b} size="small" showLabel={false} />
            ))}
          </Box>
        )}
        <Button
          onClick={onClose}
          variant="contained"
          sx={{
            mt: 2.5,
            background: '#86A86B',
            '&:hover': { background: '#6B8F50' },
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 500,
          }}
        >
          Lovely!
        </Button>
      </DialogContent>
    </Dialog>
  );
}
