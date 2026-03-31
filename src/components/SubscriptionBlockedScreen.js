import React from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import TallyLogo from './TallyLogo';

export default function SubscriptionBlockedScreen() {
  const { userRole, fetchWithAuth, logout } = useAuth();
  const isAdmin = userRole === 'admin' || userRole === 'owner';

  const handleManageBilling = async () => {
    try {
      const res = await fetchWithAuth('/api/billing/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch {
      // Silently fail — user can retry
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'background.default',
        p: 3,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          maxWidth: 480,
          width: '100%',
          p: 5,
          borderRadius: '20px',
          textAlign: 'center',
          border: '1px solid rgba(139, 115, 85, 0.1)',
          boxShadow: '0 8px 32px rgba(139, 115, 85, 0.08)',
        }}
      >
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
          <TallyLogo size={56} />
        </Box>

        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary' }}>
          Subscription Cancelled
        </Typography>

        <Typography sx={{ mb: 4, color: 'text.secondary', lineHeight: 1.6 }}>
          {isAdmin
            ? 'Your school\'s subscription has ended. Reactivate via the billing portal to restore access.'
            : 'Your school\'s subscription has ended. Please contact your school administrator to restore access.'}
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {isAdmin && (
            <Button
              variant="contained"
              onClick={handleManageBilling}
              sx={{ borderRadius: '12px', py: 1.2, textTransform: 'none', fontWeight: 600 }}
            >
              Manage Billing
            </Button>
          )}

          <Button
            variant="outlined"
            href="mailto:support@tallyreading.uk"
            sx={{ borderRadius: '12px', py: 1.2, textTransform: 'none', fontWeight: 600 }}
          >
            Contact Support
          </Button>

          <Button
            variant="text"
            onClick={logout}
            sx={{ borderRadius: '12px', py: 1, textTransform: 'none', color: 'text.secondary' }}
          >
            Log Out
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
