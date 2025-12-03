import React, { useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Box, Typography, Button, TextField, Paper } from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';

const Login = () => {
  const context = useAppContext();
  const { login, apiError } = context;
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLocalError(null);

    if (!password) {
      return;
    }

    if (typeof login !== 'function') {
      setLocalError('Internal error: login function not available');
      return;
    }

    setSubmitting(true);
    try {
      await login(password);
      setPassword('');
    } catch (error) {
      setLocalError(error && error.message ? error.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F4F1FA',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Animated Background Blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute h-[60vh] w-[60vh] rounded-full blur-3xl bg-[#7C3AED]/10 -top-[10%] -left-[10%] animate-float" style={{ position: 'fixed', top: '-10%', left: '-10%', width: '60vh', height: '60vh', borderRadius: '50%', filter: 'blur(80px)', background: 'rgba(124, 58, 237, 0.1)', zIndex: -1, animation: 'clay-float 8s ease-in-out infinite' }}></div>
        <div className="absolute h-[60vh] w-[60vh] rounded-full blur-3xl bg-[#DB2777]/10 top-[20%] -right-[10%] animate-float-delayed" style={{ position: 'fixed', top: '20%', right: '-10%', width: '60vh', height: '60vh', borderRadius: '50%', filter: 'blur(80px)', background: 'rgba(219, 39, 119, 0.1)', zIndex: -1, animation: 'clay-float-delayed 10s ease-in-out infinite' }}></div>
      </div>

      <Paper
        elevation={0}
        sx={{
          p: 5,
          borderRadius: '20px',
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 8px 32px rgba(160, 150, 180, 0.15), 0 2px 8px rgba(0, 0, 0, 0.05)',
          maxWidth: 400,
          width: '90%',
          textAlign: 'center',
          border: '1px solid rgba(255, 255, 255, 0.5)',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)',
            borderRadius: '16px',
            width: 72,
            height: 72,
            mx: 'auto',
            mb: 3,
            boxShadow: '0 8px 24px rgba(139, 92, 246, 0.35)',
          }}
        >
          <MenuBookIcon sx={{ color: 'white', fontSize: 36 }} />
        </Box>

        <Typography variant="h4" sx={{ mb: 1, fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#332F3A' }}>
          Kids Reading Manager
        </Typography>
        
        <Typography variant="body1" sx={{ mb: 4, color: '#635F69' }}>
          Enter the access password to continue.
        </Typography>

        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            type="password"
            value={password}
            placeholder="Password"
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            sx={{ mb: 3 }}
            InputProps={{
              sx: {
                borderRadius: '10px',
                backgroundColor: '#F8F6FC',
                boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.04)',
                border: '1px solid rgba(160, 150, 180, 0.15)',
                '& fieldset': { border: 'none' },
                '&:hover': {
                  backgroundColor: '#F8F6FC',
                  border: '1px solid rgba(124, 58, 237, 0.3)',
                },
                '&.Mui-focused': {
                  backgroundColor: '#ffffff',
                  border: '1px solid rgba(124, 58, 237, 0.5)',
                  boxShadow: '0 0 0 3px rgba(124, 58, 237, 0.15)'
                },
              }
            }}
          />

          <Button
            fullWidth
            type="submit"
            disabled={submitting || !password}
            variant="contained"
            size="large"
            sx={{
              height: 52,
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)',
              boxShadow: '0 6px 20px rgba(139, 92, 246, 0.35)',
              fontSize: '1rem',
              fontWeight: 700,
              textTransform: 'none',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 8px 28px rgba(139, 92, 246, 0.45)',
              },
              '&:active': {
                transform: 'scale(0.98)',
              },
            }}
          >
            {submitting ? 'Logging in...' : 'Login'}
          </Button>
        </form>

        {(localError || apiError) && (
          <Typography sx={{ mt: 3, color: '#EF4444', fontWeight: 600 }}>
            {localError || apiError}
          </Typography>
        )}
      </Paper>
    </Box>
  );
};

export default Login;