import React from 'react';
import { AppBar, Toolbar, Typography, IconButton, Box } from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import packageJson from '../../package.json';

const Header = () => {
  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        top: 0,
        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
        backdropFilter: 'saturate(120%) blur(8px)',
        borderBottom: '1px solid rgba(15,23,42,0.06)',
        px: { xs: 2, sm: 3 },
        pt: 'env(safe-area-inset-top)',
        zIndex: (theme) => theme.zIndex.appBar,
        minHeight: { xs: 56, sm: 64 },
      }}
    >
      <Toolbar sx={{ minHeight: { xs: 56, sm: 64 } }}>
        <IconButton
          edge="start"
          color="inherit"
          aria-label="menu"
          size="large"
          sx={{ mr: 2, p: { xs: 1.25, sm: 1 } }}
        >
          <MenuBookIcon />
        </IconButton>
        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}>
          <Typography
            variant="h6"
            component="div"
            sx={{
              fontFamily: (theme) => theme.typography.fontFamily,
              fontWeight: 600,
              letterSpacing: '0.25px',
              fontSize: { xs: '1rem', sm: '1.15rem' },
            }}
          >
            Kids Reading Manager
          </Typography>
        </Box>
        <Typography
          variant="body2"
          sx={{
            fontFamily: (theme) => theme.typography.fontFamily,
            fontWeight: 500,
            opacity: 0.8,
            fontSize: { xs: '0.75rem', sm: '0.875rem' },
            mr: 2,
          }}
        >
          v{packageJson.version}
        </Typography>
      </Toolbar>
    </AppBar>
  );
};

export default Header;