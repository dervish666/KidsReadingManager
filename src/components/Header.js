import React from 'react';
import { AppBar, Toolbar, Typography, IconButton, Box } from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';

const Header = () => {
  return (
    <AppBar 
      position="static" 
      elevation={0}
      sx={{
        background: 'rgba(107, 77, 87, 0.9)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
      }}
    >
      <Toolbar>
        <IconButton
          edge="start"
          color="inherit"
          aria-label="menu"
          sx={{ mr: 2 }}
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
              textShadow: '1px 1px 2px rgba(0,0,0,0.2)'
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