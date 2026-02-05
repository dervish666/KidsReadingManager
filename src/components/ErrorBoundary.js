import React from 'react';
import { Box, Typography, Button } from '@mui/material';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', p: 3, textAlign: 'center' }}>
          <Typography variant="h5" gutterBottom>Something went wrong</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            An unexpected error occurred. Please try refreshing the page.
          </Typography>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Refresh Page
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
