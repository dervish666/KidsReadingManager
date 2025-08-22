import React from 'react';
import { AppBar, Toolbar, Typography, IconButton, Box } from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';

const Header = () => {
  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        top: 0,
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.95), rgba(79, 70, 229, 0.95))',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
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
              fontFamily: 'Merriweather, Georgia, serif',
              fontWeight: 700,
              letterSpacing: '0.5px',
              textShadow: '1px 1px 2px rgba(0,0,0,0.2)',
              fontSize: { xs: '1rem', sm: '1.25rem' },
            }}
          >
            Kids Reading Manager
          </Typography>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;