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
    borderRadius: 32,
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
          backgroundColor: 'rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(20px)',
          borderRadius: 32,
          boxShadow: '16px 16px 32px rgba(160, 150, 180, 0.2), -10px -10px 24px rgba(255, 255, 255, 0.9), inset 6px 6px 12px rgba(139, 92, 246, 0.03), inset -6px -6px 12px rgba(255, 255, 255, 1)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
        },
        elevation1: {
          boxShadow: '16px 16px 32px rgba(160, 150, 180, 0.2), -10px -10px 24px rgba(255, 255, 255, 0.9), inset 6px 6px 12px rgba(139, 92, 246, 0.03), inset -6px -6px 12px rgba(255, 255, 255, 1)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 32,
          backgroundColor: 'rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(20px)',
          boxShadow: '16px 16px 32px rgba(160, 150, 180, 0.2), -10px -10px 24px rgba(255, 255, 255, 0.9), inset 6px 6px 12px rgba(139, 92, 246, 0.03), inset -6px -6px 12px rgba(255, 255, 255, 1)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'visible', // Allow elements to pop out
          '&:hover': {
            transform: 'translateY(-8px)',
            boxShadow: '20px 20px 40px rgba(160, 150, 180, 0.25), -12px -12px 28px rgba(255, 255, 255, 0.95), inset 6px 6px 12px rgba(139, 92, 246, 0.03), inset -6px -6px 12px rgba(255, 255, 255, 1)',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          padding: '12px 24px',
          fontSize: '1rem',
          fontWeight: 700,
          textTransform: 'none',
          boxShadow: '12px 12px 24px rgba(139, 92, 246, 0.3), -8px -8px 16px rgba(255, 255, 255, 0.4), inset 4px 4px 8px rgba(255, 255, 255, 0.4), inset -4px -4px 8px rgba(0, 0, 0, 0.1)',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: '16px 16px 32px rgba(139, 92, 246, 0.4), -10px -10px 20px rgba(255, 255, 255, 0.5), inset 4px 4px 8px rgba(255, 255, 255, 0.4), inset -4px -4px 8px rgba(0, 0, 0, 0.1)',
          },
          '&:active': {
            transform: 'scale(0.92)',
            boxShadow: 'inset 10px 10px 20px #d9d4e3, inset -10px -10px 20px #ffffff',
          },
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)',
          color: '#ffffff',
        },
        containedSecondary: {
          background: '#ffffff',
          color: '#332F3A',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 20,
            backgroundColor: '#EFEBF5',
            boxShadow: 'inset 6px 6px 12px #d9d4e3, inset -6px -6px 12px #ffffff',
            border: 'none',
            transition: 'all 0.2s ease',
            '& fieldset': {
              border: 'none',
            },
            '&:hover': {
              backgroundColor: '#EFEBF5',
            },
            '&.Mui-focused': {
              backgroundColor: '#ffffff',
              boxShadow: '0 0 0 4px rgba(124, 58, 237, 0.2)',
            },
          },
        },
      },
    },
    MuiBottomNavigation: {
      styleOverrides: {
        root: {
          height: 80,
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(20px)',
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          boxShadow: '0 -10px 30px rgba(0,0,0,0.05)',
        },
      },
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: {
          color: '#635F69',
          '&.Mui-selected': {
            color: '#7C3AED',
            transform: 'translateY(-4px)',
          },
        },
        label: {
          fontFamily: '"Nunito", sans-serif',
          fontWeight: 700,
          fontSize: '0.75rem',
          '&.Mui-selected': {
            fontSize: '0.875rem',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          fontWeight: 700,
          fontFamily: '"Nunito", sans-serif',
          boxShadow: '4px 4px 8px rgba(160, 150, 180, 0.2), -4px -4px 8px rgba(255, 255, 255, 0.9)',
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          borderRadius: '50%', // Perfect circles for orbs
          boxShadow: '4px 4px 8px rgba(160, 150, 180, 0.2), -4px -4px 8px rgba(255, 255, 255, 0.9)',
          border: '2px solid rgba(255, 255, 255, 0.5)',
        },
      },
    },
  },
});

export default theme;