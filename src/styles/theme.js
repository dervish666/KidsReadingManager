import { createTheme } from '@mui/material/styles';

// Create a modern theme instance with vibrant, accessible colors
const theme = createTheme({
   palette: {
     primary: {
       main: '#6366f1', // Modern indigo
       light: '#818cf8',
       dark: '#4f46e5',
     },
     secondary: {
       main: '#f59e0b', // Warm amber
       light: '#fbbf24',
       dark: '#d97706',
     },
     background: {
       default: '#fafafa', // Clean light gray
       paper: '#ffffff', // Pure white for better contrast
     },
     text: {
       primary: '#1f2937', // Modern dark gray
       secondary: '#6b7280', // Medium gray
     },
     status: {
       // Enhanced status colors with better contrast
       notRead: '#ef4444', // Bright red
       needsAttention: '#f97316', // Vibrant orange
       recentlyRead: '#22c55e', // Bright green
     },
     success: {
       main: '#10b981',
       light: '#34d399',
       dark: '#059669',
     },
     warning: {
       main: '#f59e0b',
       light: '#fbbf24',
       dark: '#d97706',
     },
     error: {
       main: '#ef4444',
       light: '#f87171',
       dark: '#dc2626',
     },
   },
  typography: {
    fontFamily: [
      'Inter',
      'system-ui',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontWeight: 700,
      fontSize: '2.5rem',
      lineHeight: 1.2,
    },
    h2: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontWeight: 600,
      fontSize: '2rem',
      lineHeight: 1.3,
    },
    h3: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontWeight: 600,
      fontSize: '1.5rem',
      lineHeight: 1.4,
    },
    h4: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontWeight: 600,
      fontSize: '1.25rem',
      lineHeight: 1.4,
    },
    h5: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontWeight: 500,
      fontSize: '1.125rem',
      lineHeight: 1.5,
    },
    h6: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontWeight: 500,
      fontSize: '1rem',
      lineHeight: 1.5,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
    },
    button: {
      textTransform: 'none',
      fontWeight: 500,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          minHeight: '100vh',
          fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11"',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 16,
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          '@media (max-width:600px)': {
            borderRadius: 12,
          }
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          textTransform: 'none',
          padding: '12px 20px',
          fontWeight: 600,
          fontSize: '0.95rem',
          transition: 'all 0.2s ease-in-out',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
          '&:hover': {
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            transform: 'translateY(-1px)',
          },
          '@media (max-width:600px)': {
            padding: '14px 20px',
            fontSize: '1rem',
            minHeight: 48, // Better touch target
            borderRadius: 10,
          }
        },
        contained: {
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
          '&:hover': {
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          }
        },
      },
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
          transition: 'all 0.2s ease-in-out',
          border: '1px solid rgba(0, 0, 0, 0.05)',
          '&:hover': {
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            transform: 'translateY(-2px)',
          },
          '@media (max-width:600px)': {
            borderRadius: 12,
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            '&:hover': {
              boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.1)',
              transform: 'translateY(-1px)',
            }
          }
        },
      },
    },
    MuiCardActionArea: {
      styleOverrides: {
        root: {
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.02)',
          },
          '@media (max-width:600px)': {
            padding: 16,
            minHeight: 48,
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        fullWidth: true,
        margin: 'normal',
      },
    },
    MuiBottomNavigation: {
      styleOverrides: {
        root: {
          height: 64,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(0, 0, 0, 0.08)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          boxShadow: '0 -1px 3px 0 rgba(0, 0, 0, 0.1), 0 -1px 2px 0 rgba(0, 0, 0, 0.06)',
          '@media (max-width:600px)': {
            height: 72,
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)'
          }
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          overflow: 'auto',
          '& .MuiTabs-scroller': {
            overflow: 'auto !important',
          },
        },
        indicator: {
          height: 3,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minWidth: 'auto',
          padding: '12px 16px',
          '@media (max-width: 600px)': {
            minWidth: 'auto',
            padding: '12px 8px',
          },
        },
      },
    },
  },
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 960,
      lg: 1280,
      xl: 1920,
    },
  },
  shape: {
    borderRadius: 12,
  },
  shadows: [
    'none',
    '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    // ... other shadows
  ],
});

export default theme;