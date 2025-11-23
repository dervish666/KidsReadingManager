import { createTheme } from '@mui/material/styles';

// Create a modern theme instance with vibrant, accessible colors
const theme = createTheme({
   palette: {
     primary: {
       main: '#6C5CE7', // Soft Purple
       light: '#A29BFE',
       dark: '#4834D4',
       contrastText: '#ffffff',
     },
     secondary: {
       main: '#00CEC9', // Robin's Egg Blue
       light: '#81ECEC',
       dark: '#00B894',
       contrastText: '#2D3436',
     },
     background: {
       default: '#DFE6E9', // Light Grayish Blue
       paper: '#ffffff', // Pure white for better contrast
     },
     text: {
       primary: '#2D3436', // Dark Gray
       secondary: '#636E72', // Medium Gray
     },
     status: {
       // Enhanced status colors with new palette
       notRead: '#FF7675', // Light Red
       needsAttention: '#FD79A8', // Pink
       recentlyRead: '#55EFC4', // Mint Green
     },
     success: {
       main: '#00B894', // Green
       light: '#55EFC4',
       dark: '#00A884',
     },
     warning: {
       main: '#FDCB6E', // Mustard Yellow
       light: '#FFEAA7',
       dark: '#E1B12C',
     },
     error: {
       main: '#D63031', // Red
       light: '#FF7675',
       dark: '#C0392B',
     },
   },
  typography: {
    fontFamily: [
      'Fredoka',
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
      fontFamily: 'Fredoka, system-ui, sans-serif',
      fontWeight: 700,
      fontSize: 'clamp(1.75rem, 4.5vw, 2.5rem)',
      lineHeight: 1.15,
      color: '#2D3436',
    },
    h2: {
      fontFamily: 'Fredoka, system-ui, sans-serif',
      fontWeight: 600,
      fontSize: 'clamp(1.25rem, 3.2vw, 2rem)',
      lineHeight: 1.2,
      color: '#2D3436',
    },
    h3: {
      fontFamily: 'Fredoka, system-ui, sans-serif',
      fontWeight: 600,
      fontSize: 'clamp(1.125rem, 2.2vw, 1.5rem)',
      lineHeight: 1.3,
      color: '#2D3436',
    },
    h4: {
      fontFamily: 'Fredoka, system-ui, sans-serif',
      fontWeight: 600,
      fontSize: '1.125rem',
      lineHeight: 1.3,
      color: '#2D3436',
    },
    h5: {
      fontFamily: 'Fredoka, system-ui, sans-serif',
      fontWeight: 500,
      fontSize: '1rem',
      lineHeight: 1.4,
      color: '#2D3436',
    },
    h6: {
      fontFamily: 'Fredoka, system-ui, sans-serif',
      fontWeight: 500,
      fontSize: '0.95rem',
      lineHeight: 1.4,
      color: '#2D3436',
    },
    body1: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 'clamp(0.95rem, 1.6vw, 1rem)',
      lineHeight: 1.6,
      color: '#2D3436',
    },
    body2: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 'clamp(0.825rem, 1.2vw, 0.875rem)',
      lineHeight: 1.5,
      color: '#636E72',
    },
    button: {
      fontFamily: 'Fredoka, system-ui, sans-serif',
      textTransform: 'none',
      fontWeight: 600,
      letterSpacing: '0.5px',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          minHeight: '100vh',
          fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11"',
          backgroundColor: '#DFE6E9',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 20,
          boxShadow: '0 10px 20px rgba(0,0,0,0.05), 0 6px 6px rgba(0,0,0,0.05)',
          '@media (max-width:600px)': {
            borderRadius: 16,
          }
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 25, // Pill shape
          textTransform: 'none',
          padding: '10px 24px',
          fontWeight: 600,
          fontSize: '1rem',
          transition: 'transform 140ms ease, box-shadow 140ms ease',
          boxShadow: '0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08)',
          '&:hover': {
            boxShadow: '0 7px 14px rgba(50, 50, 93, 0.1), 0 3px 6px rgba(0, 0, 0, 0.08)',
            transform: 'translateY(-1px)',
          },
          '@media (max-width:600px)': {
            padding: '12px 20px',
            fontSize: '1rem',
            minHeight: 48, // Better touch target
            borderRadius: 20,
          }
        },
        contained: {
          boxShadow: '0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08)',
          '&:hover': {
            boxShadow: '0 7px 14px rgba(50, 50, 93, 0.1), 0 3px 6px rgba(0, 0, 0, 0.08)',
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
          borderRadius: 20,
          boxShadow: '0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08)',
          transition: 'all 0.2s ease-in-out',
          border: 'none',
          '&:hover': {
            boxShadow: '0 13px 27px -5px rgba(50, 50, 93, 0.25), 0 8px 16px -8px rgba(0, 0, 0, 0.3)',
            transform: 'translateY(-3px)',
          },
          '@media (max-width:600px)': {
            borderRadius: 16,
            boxShadow: '0 2px 5px rgba(50, 50, 93, 0.1), 0 1px 2px rgba(0, 0, 0, 0.08)',
            '&:hover': {
              boxShadow: '0 5px 15px rgba(0, 0, 0, 0.1)',
              transform: 'translateY(-1px)',
            }
          }
        },
      },
    },
    MuiCardActionArea: {
      styleOverrides: {
        root: {
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.01)',
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
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
            backgroundColor: '#F5F6FA',
            '& fieldset': {
              borderColor: 'transparent',
            },
            '&:hover fieldset': {
              borderColor: '#B2BEC3',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#6C5CE7',
            },
          },
        },
      },
    },
    MuiBottomNavigation: {
      styleOverrides: {
        root: {
          height: 70,
          background: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          borderTop: 'none',
          paddingBottom: 'env(safe-area-inset-bottom)',
          boxShadow: '0 -5px 20px rgba(0,0,0,0.05)',
          '@media (max-width:600px)': {
            height: 80,
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)'
          }
        },
      },
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: {
          color: '#B2BEC3',
          '&.Mui-selected': {
            color: '#6C5CE7',
          },
        },
        label: {
          fontFamily: 'Fredoka, sans-serif',
          fontWeight: 600,
        }
      }
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
          height: 4,
          borderRadius: '4px 4px 0 0',
          backgroundColor: '#6C5CE7',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minWidth: 'auto',
          padding: '12px 20px',
          fontFamily: 'Fredoka, sans-serif',
          fontWeight: 600,
          fontSize: '1rem',
          textTransform: 'none',
          color: '#636E72',
          '&.Mui-selected': {
            color: '#6C5CE7',
          },
          '@media (max-width: 600px)': {
            minWidth: 'auto',
            padding: '12px 12px',
            fontSize: '0.9rem',
          },
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          borderRadius: 12, // Rounded squares for avatars
          fontWeight: 700,
          fontFamily: 'Fredoka, sans-serif',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 600,
          fontFamily: 'Fredoka, sans-serif',
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
    borderRadius: 16,
  },
  shadows: [
    'none',
    '0 2px 5px rgba(50, 50, 93, 0.1), 0 1px 2px rgba(0, 0, 0, 0.08)',
    '0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08)',
    '0 7px 14px rgba(50, 50, 93, 0.1), 0 3px 6px rgba(0, 0, 0, 0.08)',
    '0 13px 27px -5px rgba(50, 50, 93, 0.25), 0 8px 16px -8px rgba(0, 0, 0, 0.3)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    // ... other shadows
    'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'
  ],
});

export default theme;