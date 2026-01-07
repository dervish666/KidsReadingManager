import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Box, Typography, Button, TextField, Paper, Link, Tabs, Tab, Alert, CircularProgress } from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

/**
 * Login Component
 *
 * Supports two authentication modes:
 * 1. Legacy mode: Simple shared password (when isMultiTenantMode is false)
 * 2. Multi-tenant mode: Email/password with organization context (when isMultiTenantMode is true)
 */
// API URL - relative path since frontend and API are served from the same origin
const API_URL = '/api';

const Login = () => {
  const context = useAppContext();
  const { login, loginWithEmail, register, apiError, isMultiTenantMode, serverAuthModeDetected } = context;

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // View state: 'login' | 'forgot' | 'reset'
  const [view, setView] = useState('login');
  const [resetToken, setResetToken] = useState('');

  // Check URL for reset token on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
      setResetToken(token);
      setView('reset');
      // Clean URL without reload
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleLegacyLogin = async (event) => {
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

  const handleMultiTenantLogin = async (event) => {
    event.preventDefault();
    setLocalError(null);
    setSuccessMessage(null);

    if (!email || !password) {
      setLocalError('Email and password are required');
      return;
    }

    if (typeof loginWithEmail !== 'function') {
      setLocalError('Internal error: loginWithEmail function not available');
      return;
    }

    setSubmitting(true);
    try {
      await loginWithEmail(email, password);
      setEmail('');
      setPassword('');
    } catch (error) {
      setLocalError(error && error.message ? error.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (event) => {
    if (!isMultiTenantMode) {
      return handleLegacyLogin(event);
    }

    return handleMultiTenantLogin(event);
  };

  const handleForgotPassword = async (event) => {
    event.preventDefault();
    setLocalError(null);
    setSuccessMessage(null);

    if (!email) {
      setLocalError('Email is required');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to request password reset');
      }

      setSuccessMessage('If an account exists with this email, you will receive a password reset link.');
      setEmail('');
    } catch (error) {
      setLocalError(error.message || 'Failed to request password reset');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    setLocalError(null);
    setSuccessMessage(null);

    if (!password) {
      setLocalError('Password is required');
      return;
    }

    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }

      setSuccessMessage('Password reset successfully! You can now log in with your new password.');
      setPassword('');
      setConfirmPassword('');
      setResetToken('');
      // Switch back to login after short delay
      setTimeout(() => setView('login'), 2000);
    } catch (error) {
      setLocalError(error.message || 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  const renderLegacyForm = () => (
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
  );

  const renderMultiTenantForm = () => (
    <>
      <form onSubmit={handleSubmit}>
        <TextField
          fullWidth
          type="email"
          value={email}
          placeholder="Email"
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          sx={{ mb: 2 }}
          InputProps={{
            sx: inputStyles
          }}
        />

        <TextField
          fullWidth
          type="password"
          value={password}
          placeholder="Password"
          onChange={(e) => setPassword(e.target.value)}
          sx={{ mb: 3 }}
          InputProps={{
            sx: inputStyles
          }}
        />

        <Button
          fullWidth
          type="submit"
          disabled={submitting || !email || !password}
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

        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Link
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setLocalError(null);
              setSuccessMessage(null);
              setView('forgot');
            }}
            sx={{ color: '#7C3AED', fontSize: '0.875rem', cursor: 'pointer' }}
          >
            Forgot your password?
          </Link>
        </Box>
      </form>
    </>
  );

  const renderForgotPasswordForm = () => (
    <>
      <form onSubmit={handleForgotPassword}>
        <TextField
          fullWidth
          type="email"
          value={email}
          placeholder="Enter your email address"
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          sx={{ mb: 3 }}
          InputProps={{
            sx: inputStyles
          }}
        />

        <Button
          fullWidth
          type="submit"
          disabled={submitting || !email}
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
          {submitting ? 'Sending...' : 'Send Reset Link'}
        </Button>

        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Link
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setLocalError(null);
              setSuccessMessage(null);
              setView('login');
            }}
            sx={{ color: '#7C3AED', fontSize: '0.875rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
          >
            <ArrowBackIcon sx={{ fontSize: 16 }} />
            Back to login
          </Link>
        </Box>
      </form>
    </>
  );

  const renderResetPasswordForm = () => (
    <>
      <form onSubmit={handleResetPassword}>
        <TextField
          fullWidth
          type="password"
          value={password}
          placeholder="New password"
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          sx={{ mb: 2 }}
          InputProps={{
            sx: inputStyles
          }}
        />

        <TextField
          fullWidth
          type="password"
          value={confirmPassword}
          placeholder="Confirm new password"
          onChange={(e) => setConfirmPassword(e.target.value)}
          sx={{ mb: 3 }}
          InputProps={{
            sx: inputStyles
          }}
        />

        <Button
          fullWidth
          type="submit"
          disabled={submitting || !password || !confirmPassword}
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
          {submitting ? 'Resetting...' : 'Reset Password'}
        </Button>

        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Link
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setLocalError(null);
              setSuccessMessage(null);
              setResetToken('');
              setView('login');
            }}
            sx={{ color: '#7C3AED', fontSize: '0.875rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
          >
            <ArrowBackIcon sx={{ fontSize: 16 }} />
            Back to login
          </Link>
        </Box>
      </form>
    </>
  );

  const inputStyles = {
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
  };

  // Show loading state while detecting auth mode from server
  if (!serverAuthModeDetected) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F4F1FA',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <CircularProgress sx={{ color: '#7C3AED' }} />
        <Typography variant="body1" sx={{ color: '#635F69' }}>
          Loading...
        </Typography>
      </Box>
    );
  }

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
          {view === 'forgot' && 'Enter your email to reset your password.'}
          {view === 'reset' && 'Enter your new password.'}
          {view === 'login' && (isMultiTenantMode
            ? 'Sign in to your account.'
            : 'Enter the access password to continue.'
          )}
        </Typography>

        {successMessage && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {successMessage}
          </Alert>
        )}

        {view === 'login' && (isMultiTenantMode ? renderMultiTenantForm() : renderLegacyForm())}
        {view === 'forgot' && renderForgotPasswordForm()}
        {view === 'reset' && renderResetPasswordForm()}

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
