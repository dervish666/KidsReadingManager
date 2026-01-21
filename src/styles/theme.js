import { createTheme } from '@mui/material/styles';

// Cozy Bookshelf Theme - Warm, inviting design with sage green accents
const theme = createTheme({
  palette: {
    primary: {
      main: '#6B8E6B', // Sage Green
      light: '#8AAD8A',
      dark: '#557055',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#8B7355', // Warm Brown
      light: '#A89070',
      dark: '#6D5A43',
      contrastText: '#ffffff',
    },
    background: {
      default: '#F5F0E8', // Warm Cream
      paper: 'rgba(255, 254, 249, 0.9)', // Ivory with transparency
    },
    text: {
      primary: '#4A4A4A', // Dark Gray
      secondary: '#7A7A7A', // Warm Gray
    },
    status: {
      notRead: '#C17E7E', // Muted Red
      needsAttention: '#D4A574', // Warm Amber
      recentlyRead: '#6B8E6B', // Sage Green
    },
    success: {
      main: '#6B8E6B', // Sage Green
      light: '#8AAD8A',
      dark: '#557055',
    },
    warning: {
      main: '#D4A574', // Warm Amber
      light: '#E0BB8F',
      dark: '#B88B5A',
    },
    error: {
      main: '#C17E7E', // Muted Red
      light: '#D49999',
      dark: '#A66565',
    },
    info: {
      main: '#7A9EAD', // Muted Teal
    },
  },
  typography: {
    fontFamily: '"DM Sans", "Inter", sans-serif',
    h1: {
      fontFamily: '"Nunito", sans-serif',
      fontWeight: 900,
      letterSpacing: '-0.025em',
      color: '#4A4A4A',
    },
    h2: {
      fontFamily: '"Nunito", sans-serif',
      fontWeight: 800,
      letterSpacing: '-0.025em',
      color: '#4A4A4A',
    },
    h3: {
      fontFamily: '"Nunito", sans-serif',
      fontWeight: 800,
      color: '#4A4A4A',
    },
    h4: {
      fontFamily: '"Nunito", sans-serif',
      fontWeight: 700,
      color: '#4A4A4A',
    },
    h5: {
      fontFamily: '"Nunito", sans-serif',
      fontWeight: 700,
      color: '#4A4A4A',
    },
    h6: {
      fontFamily: '"Nunito", sans-serif',
      fontWeight: 700,
      color: '#4A4A4A',
    },
    button: {
      fontFamily: '"DM Sans", sans-serif',
      fontWeight: 700,
      textTransform: 'none',
      letterSpacing: '0.025em',
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.625,
      color: '#7A7A7A',
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
      color: '#7A7A7A',
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#F5F0E8',
          backgroundImage: 'none',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(255, 254, 249, 0.85)',
          backdropFilter: 'blur(20px)',
          borderRadius: 16,
          boxShadow: '0 8px 32px rgba(139, 115, 85, 0.08), 0 2px 8px rgba(0, 0, 0, 0.03)',
          border: '1px solid rgba(139, 115, 85, 0.1)',
        },
        elevation1: {
          boxShadow: '0 4px 16px rgba(139, 115, 85, 0.08), 0 2px 6px rgba(0, 0, 0, 0.02)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: 'rgba(255, 254, 249, 0.95)',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 4px 12px rgba(139, 115, 85, 0.1), 0 2px 4px rgba(0, 0, 0, 0.04)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'visible',
          border: '1px solid rgba(139, 115, 85, 0.08)',
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: '0 8px 24px rgba(139, 115, 85, 0.15), 0 4px 8px rgba(0, 0, 0, 0.06)',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          padding: '10px 20px',
          fontSize: '0.95rem',
          fontWeight: 700,
          textTransform: 'none',
          boxShadow: '0 4px 12px rgba(107, 142, 107, 0.2)',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 6px 20px rgba(107, 142, 107, 0.3)',
          },
          '&:active': {
            transform: 'scale(0.98)',
            boxShadow: '0 2px 8px rgba(107, 142, 107, 0.15)',
          },
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
          color: '#ffffff',
        },
        containedSecondary: {
          background: '#FFFEF9',
          color: '#4A4A4A',
          boxShadow: '0 4px 12px rgba(139, 115, 85, 0.15)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
            backgroundColor: '#FAF8F3',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.03)',
            border: '1px solid rgba(139, 115, 85, 0.12)',
            transition: 'all 0.2s ease',
            '& fieldset': {
              border: 'none',
            },
            '&:hover': {
              backgroundColor: '#FAF8F3',
              border: '1px solid rgba(107, 142, 107, 0.3)',
            },
            '&.Mui-focused': {
              backgroundColor: '#ffffff',
              border: '1px solid rgba(107, 142, 107, 0.5)',
              boxShadow: '0 0 0 3px rgba(107, 142, 107, 0.12)',
            },
          },
        },
      },
    },
    MuiBottomNavigation: {
      styleOverrides: {
        root: {
          height: 72,
          backgroundColor: 'rgba(255, 254, 249, 0.98)',
          backdropFilter: 'blur(20px)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          boxShadow: '0 -4px 20px rgba(139, 115, 85, 0.06)',
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          transform: 'translateZ(0)',
          WebkitTransform: 'translateZ(0)',
          willChange: 'transform',
          paddingBottom: 'env(safe-area-inset-bottom)',
          overflow: 'hidden',
          zIndex: 1100,
          height: '80px',
        },
      },
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: {
          color: '#7A7A7A',
          minHeight: '60px',
          padding: '8px 4px',
          flex: 1,
          '&.Mui-selected': {
            color: '#6B8E6B',
            transform: 'translateY(-2px)',
          },
          '&:active': {
            transform: 'scale(0.95)',
          },
        },
        label: {
          fontFamily: '"Nunito", sans-serif',
          fontWeight: 700,
          fontSize: '0.7rem',
          marginTop: '4px',
          '&.Mui-selected': {
            fontSize: '0.75rem',
          },
        },
        wrapper: {
          flexDirection: 'column',
          gap: '2px',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 600,
          fontFamily: '"DM Sans", sans-serif',
          boxShadow: 'none',
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          boxShadow: '0 2px 8px rgba(139, 115, 85, 0.12)',
          border: '2px solid rgba(255, 254, 249, 0.8)',
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          color: '#6B8E6B',
        },
        thumb: {
          boxShadow: '0 4px 8px rgba(107, 142, 107, 0.3)',
        },
        rail: {
          opacity: 0.3,
          backgroundColor: '#8B7355',
        },
      },
    },
  },
});

export default theme;
