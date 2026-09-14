import React from 'react';
import * as Sentry from '@sentry/react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import HomeIcon from '@mui/icons-material/Home';
import { recoverFromChunkError } from '../utils/chunkRecovery';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, recovering: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);

    // A lazy route whose chunk has been replaced by a deploy is not a crash,
    // it is a stale tab. Reload once to pick up the current bundle instead of
    // showing a scary panel and filing a ticket about it. If the reload has
    // already been spent, we fall through and report as normal, so a genuinely
    // broken chunk still reaches Sentry on the second attempt.
    if (recoverFromChunkError(error)) {
      this.setState({ recovering: true });
      return;
    }

    Sentry.captureException(error, { extra: errorInfo });
  }

  render() {
    if (this.state.recovering) {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            gap: 2,
            backgroundColor: '#F5F0E8',
          }}
        >
          <CircularProgress sx={{ color: '#6B8E6B' }} />
          <Typography variant="body2" sx={{ color: '#666666' }}>
            Updating to the latest version...
          </Typography>
        </Box>
      );
    }

    if (this.state.hasError) {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            p: 3,
            textAlign: 'center',
            backgroundColor: '#F5F0E8',
          }}
        >
          <Box
            sx={{
              maxWidth: 420,
              p: 4,
              borderRadius: '16px',
              backgroundColor: 'rgba(255, 254, 249, 0.95)',
              boxShadow: '0 8px 32px rgba(139, 115, 85, 0.08), 0 2px 8px rgba(0, 0, 0, 0.03)',
              border: '1px solid rgba(139, 115, 85, 0.1)',
            }}
          >
            <Typography
              variant="h5"
              sx={{
                fontFamily: '"Nunito", sans-serif',
                fontWeight: 800,
                color: '#4A4A4A',
                mb: 1,
              }}
            >
              Something went wrong
            </Typography>
            <Typography variant="body1" sx={{ color: '#666666', mb: 3, lineHeight: 1.6 }}>
              Your data is safe. Try refreshing the page, or head back to the home screen.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Button
                variant="contained"
                startIcon={<RefreshIcon />}
                onClick={() => window.location.reload()}
                sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700 }}
              >
                Refresh Page
              </Button>
              <Button
                variant="outlined"
                startIcon={<HomeIcon />}
                onClick={() => {
                  window.location.href = '/';
                }}
                sx={{
                  borderRadius: '10px',
                  textTransform: 'none',
                  fontWeight: 600,
                  borderColor: 'rgba(107, 142, 107, 0.3)',
                  color: '#6B8E6B',
                  '&:hover': {
                    borderColor: '#6B8E6B',
                    backgroundColor: 'rgba(107, 142, 107, 0.05)',
                  },
                }}
              >
                Go to Home
              </Button>
            </Box>

            <Typography variant="caption" sx={{ display: 'block', mt: 3, color: '#999999' }}>
              If this keeps happening, please contact your school administrator.
            </Typography>
          </Box>
        </Box>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
