import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Box, Typography, Button, TextField, Paper, Link, Tabs, Tab, Alert, CircularProgress } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import TallyLogo from './TallyLogo';

/**
 * Login Component
 *
 * Supports two authentication modes:
 * 1. Legacy mode: Simple shared password (when isMultiTenantMode is false)
 * 2. Multi-tenant mode: Email/password with organization context (when isMultiTenantMode is true)
 */
// API URL - relative path since frontend and API are served from the same origin
const API_URL = '/api';

const Login = ({ onBackToLanding } = {}) => {
  const context = useAppContext();
  const { login, loginWithEmail, register, apiError, isMultiTenantMode, serverAuthModeDetected, ssoEnabled } = context;

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
        label="Password"
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
        sx={{ mb: 3 }}
        InputProps={{
          sx: {
            borderRadius: '10px',
            backgroundColor: '#FAF8F3',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.04)',
            border: '1px solid rgba(139, 115, 85, 0.15)',
            '& fieldset': { border: 'none' },
            '&:hover': {
              backgroundColor: '#FAF8F3',
              border: '1px solid rgba(107, 142, 107, 0.3)',
            },
            '&.Mui-focused': {
              backgroundColor: '#ffffff',
              border: '1px solid rgba(107, 142, 107, 0.5)',
              boxShadow: '0 0 0 3px rgba(107, 142, 107, 0.15)'
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
          background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
          boxShadow: '0 6px 20px rgba(107, 142, 107, 0.35)',
          fontSize: '1rem',
          fontWeight: 700,
          textTransform: 'none',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 8px 28px rgba(107, 142, 107, 0.45)',
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
          label="Email"
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
          label="Password"
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
            background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
            boxShadow: '0 6px 20px rgba(107, 142, 107, 0.35)',
            fontSize: '1rem',
            fontWeight: 700,
            textTransform: 'none',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: '0 8px 28px rgba(107, 142, 107, 0.45)',
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
            sx={{ color: '#6B8E6B', fontSize: '0.875rem', cursor: 'pointer' }}
          >
            Forgot your password?
          </Link>
        </Box>
      </form>

      {/* SSO Divider + MyLogin Button (only when SSO is configured on server) */}
      {ssoEnabled && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', my: 3 }}>
            <Box sx={{ flex: 1, height: '1px', bgcolor: 'rgba(0,0,0,0.12)' }} />
            <Typography variant="body2" sx={{ px: 2, color: '#999' }}>or</Typography>
            <Box sx={{ flex: 1, height: '1px', bgcolor: 'rgba(0,0,0,0.12)' }} />
          </Box>

          <Button
            fullWidth
            variant="outlined"
            size="large"
            onClick={() => { window.location.href = '/api/auth/mylogin/login'; }}
            sx={{
              height: 52,
              borderRadius: '12px',
              borderColor: '#00D37F',
              color: '#333',
              fontSize: '1rem',
              fontWeight: 600,
              textTransform: 'none',
              '&:hover': {
                borderColor: '#00B36B',
                backgroundColor: 'rgba(0, 211, 127, 0.05)',
              },
            }}
          >
            Sign in with MyLogin
          </Button>
        </>
      )}
    </>
  );

  const renderForgotPasswordForm = () => (
    <>
      <form onSubmit={handleForgotPassword}>
        <TextField
          fullWidth
          type="email"
          value={email}
          label="Email address"
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
            background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
            boxShadow: '0 6px 20px rgba(107, 142, 107, 0.35)',
            fontSize: '1rem',
            fontWeight: 700,
            textTransform: 'none',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: '0 8px 28px rgba(107, 142, 107, 0.45)',
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
            sx={{ color: '#6B8E6B', fontSize: '0.875rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
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
          label="New password"
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
          label="Confirm new password"
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
            background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
            boxShadow: '0 6px 20px rgba(107, 142, 107, 0.35)',
            fontSize: '1rem',
            fontWeight: 700,
            textTransform: 'none',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: '0 8px 28px rgba(107, 142, 107, 0.45)',
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
            sx={{ color: '#6B8E6B', fontSize: '0.875rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
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
    backgroundColor: '#FAF8F3',
    boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.04)',
    border: '1px solid rgba(139, 115, 85, 0.15)',
    '& fieldset': { border: 'none' },
    '&:hover': {
      backgroundColor: '#FAF8F3',
      border: '1px solid rgba(107, 142, 107, 0.3)',
    },
    '&.Mui-focused': {
      backgroundColor: '#ffffff',
      border: '1px solid rgba(107, 142, 107, 0.5)',
      boxShadow: '0 0 0 3px rgba(107, 142, 107, 0.15)'
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
          backgroundColor: '#F5F0E8',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <CircularProgress sx={{ color: '#6B8E6B' }} />
        <Typography variant="body1" sx={{ color: '#7A7A7A' }}>
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
        backgroundColor: '#F5F0E8',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Animated Background Blobs */}
      <Paper
        elevation={0}
        sx={{
          p: 5,
          borderRadius: '20px',
          backgroundColor: '#FFFEF9',
          boxShadow: '0 8px 32px rgba(139, 115, 85, 0.15), 0 2px 8px rgba(0, 0, 0, 0.05)',
          maxWidth: 400,
          width: '90%',
          textAlign: 'center',
          border: '1px solid rgba(255, 255, 255, 0.5)',
          position: 'relative',
        }}
      >
        {onBackToLanding && (
          <Link
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onBackToLanding();
            }}
            sx={{
              position: 'absolute',
              top: 16,
              left: 20,
              color: '#6B8E6B',
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            <ArrowBackIcon sx={{ fontSize: 16 }} />
            Back
          </Link>
        )}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
            borderRadius: '16px',
            width: 72,
            height: 72,
            mx: 'auto',
            mb: 3,
            boxShadow: '0 8px 24px rgba(107, 142, 107, 0.35)',
          }}
        >
          <TallyLogo size={36} />
        </Box>

        <Typography variant="h4" sx={{ mb: 1, fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#4A4A4A' }}>
          Tally Reading
        </Typography>

        <Typography variant="body1" sx={{ mb: 4, color: '#7A7A7A' }}>
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
          <Alert severity="error" role="alert" sx={{ mt: 3 }}>
            {localError || apiError}
          </Alert>
        )}
      </Paper>

      <Typography
        variant="body2"
        sx={{ mt: 2, textAlign: 'center', color: 'rgba(74, 74, 74, 0.6)' }}
      >
        <Link href="/privacy" target="_blank" rel="noopener" sx={{ color: '#6B8E6B' }}>
          Privacy Policy
        </Link>
        {' · '}
        <Link href="/terms" target="_blank" rel="noopener" sx={{ color: '#6B8E6B' }}>
          Terms
        </Link>
        {' · '}
        <Link href="/cookies" target="_blank" rel="noopener" sx={{ color: '#6B8E6B' }}>
          Cookies
        </Link>
      </Typography>
    </Box>
  );
};

export default Login;
