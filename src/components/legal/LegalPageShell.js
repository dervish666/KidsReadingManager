import React from 'react';
import { Box, Container, Paper, Link } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

// Shared chrome for the /legal hub and individual legal documents: warm
// background, a back link, and a cream "bookshelf" paper surface. Matches the
// look of the standalone Privacy/Terms/Cookies pages.
const LegalPageShell = ({ backHref = '/', backLabel = 'Back to Tally Reading', children }) => (
  <Box
    sx={{
      minHeight: '100vh',
      backgroundColor: 'background.default',
      py: { xs: 2, sm: 4 },
      px: { xs: 1, sm: 2 },
    }}
  >
    <Container maxWidth="md">
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <Link
          href={backHref}
          underline="hover"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            color: 'primary.main',
            fontWeight: 600,
            fontFamily: '"DM Sans", sans-serif',
            fontSize: '0.95rem',
          }}
        >
          <ArrowBackIcon fontSize="small" />
          {backLabel}
        </Link>
      </Box>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 3, sm: 5 },
          borderRadius: '16px',
          backgroundColor: 'rgba(255, 254, 249, 0.9)',
          border: '1px solid rgba(139, 115, 85, 0.1)',
          boxShadow: '0 8px 32px rgba(139, 115, 85, 0.08), 0 2px 8px rgba(0, 0, 0, 0.03)',
        }}
      >
        {children}
      </Paper>
    </Container>
  </Box>
);

export default LegalPageShell;
