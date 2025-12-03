import { createTheme } from '@mui/material/styles';

// High-Fidelity Claymorphism Theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#7C3AED', // Vivid Violet
      light: '#A78BFA',
      dark: '#6D28D9',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#DB2777', // Hot Pink
      light: '#F472B6',
      dark: '#BE185D',
      contrastText: '#ffffff',
    },
    background: {
      default: '#F4F1FA', // Canvas
      paper: 'rgba(255, 255, 255, 0.6)', // Glass effect
    },
    text: {
      primary: '#332F3A', // Soft Charcoal
      secondary: '#635F69', // Muted Lavender-Gray
    },
    status: {
      notRead: '#EF4444', // Red
      needsAttention: '#F59E0B', // Amber
      recentlyRead: '#10B981', // Emerald Green
    },
    success: {
      main: '#10B981', // Emerald Green
    },
    warning: {
      main: '#F59E0B', // Amber
    },
    error: {
      main: '#EF4444', // Red
    },
    info: {
      main: '#0EA5E9', // Sky Blue
    },
  },
  typography: {
    fontFamily: '"DM Sans", "Inter", sans-serif',
    h1: {
      fontFamily: '"Nunito", sans-serif',
      fontWeight: 900,
      letterSpacing: '-0.025em',
      color: '#332F3A',
    },
    h2: {
      fontFamily: '"Nunito", sans-serif',
      fontWeight: 800,
      letterSpacing: '-0.025em',
      color: '#332F3A',
    },
    h3: {
      fontFamily: '"Nunito", sans-serif',
      fontWeight: 800,
      color: '#332F3A',
    },
    h4: {
      fontFamily: '"Nunito", sans-serif',
      fontWeight: 700,
      color: '#332F3A',
    },
    h5: {
      fontFamily: '"Nunito", sans-serif',
      fontWeight: 700,
      color: '#332F3A',
    },
    h6: {
      fontFamily: '"Nunito", sans-serif',
      fontWeight: 700,
      color: '#332F3A',
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
      color: '#635F69',
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
      color: '#635F69',
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#F4F1FA',
          backgroundImage: 'none', // Handled by App.js blobs
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(255, 255, 255, 0.75)',
          backdropFilter: 'blur(20px)',
          borderRadius: 16,
          boxShadow: '0 8px 32px rgba(160, 150, 180, 0.12), 0 2px 8px rgba(0, 0, 0, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.5)',
        },
        elevation1: {
          boxShadow: '0 4px 16px rgba(160, 150, 180, 0.1), 0 2px 6px rgba(0, 0, 0, 0.03)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 4px 12px rgba(160, 150, 180, 0.15), 0 2px 4px rgba(0, 0, 0, 0.05)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'visible',
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: '0 8px 24px rgba(160, 150, 180, 0.2), 0 4px 8px rgba(0, 0, 0, 0.08)',
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
          boxShadow: '0 4px 12px rgba(139, 92, 246, 0.25)',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 6px 20px rgba(139, 92, 246, 0.35)',
          },
          '&:active': {
            transform: 'scale(0.98)',
            boxShadow: '0 2px 8px rgba(139, 92, 246, 0.2)',
          },
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)',
          color: '#ffffff',
        },
        containedSecondary: {
          background: '#ffffff',
          color: '#332F3A',
          boxShadow: '0 4px 12px rgba(160, 150, 180, 0.2)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
            backgroundColor: '#F8F6FC',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.04)',
            border: '1px solid rgba(160, 150, 180, 0.15)',
            transition: 'all 0.2s ease',
            '& fieldset': {
              border: 'none',
            },
            '&:hover': {
              backgroundColor: '#F8F6FC',
              border: '1px solid rgba(124, 58, 237, 0.3)',
            },
            '&.Mui-focused': {
              backgroundColor: '#ffffff',
              border: '1px solid rgba(124, 58, 237, 0.5)',
              boxShadow: '0 0 0 3px rgba(124, 58, 237, 0.15)',
            },
          },
        },
      },
    },
    MuiBottomNavigation: {
      styleOverrides: {
        root: {
          height: 72,
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          boxShadow: '0 -4px 20px rgba(0,0,0,0.04)',
        },
      },
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: {
          color: '#635F69',
          '&.Mui-selected': {
            color: '#7C3AED',
            transform: 'translateY(-2px)',
          },
        },
        label: {
          fontFamily: '"Nunito", sans-serif',
          fontWeight: 700,
          fontSize: '0.7rem',
          '&.Mui-selected': {
            fontSize: '0.75rem',
          },
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
          borderRadius: 10, // Rounded squares instead of circles
          boxShadow: '0 2px 8px rgba(160, 150, 180, 0.15)',
          border: '2px solid rgba(255, 255, 255, 0.7)',
        },
      },
    },
  },
});

export default theme;