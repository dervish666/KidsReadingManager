import { createTheme } from '@mui/material/styles';

// Create a theme instance with colors inspired by the bookshelf image
const theme = createTheme({
  palette: {
    primary: {
      main: '#6b4d57', // Warm brown from the bookshelf
      light: '#8e7681',
      dark: '#4a2c36',
    },
    secondary: {
      main: '#e0c3a0', // Warm beige from the books
      light: '#f5e8d5',
      dark: '#b09273',
    },
    background: {
      default: '#f8f5f0', // Light cream background
      paper: 'rgba(255, 255, 255, 0.85)', // Semi-transparent white
    },
    text: {
      primary: '#2c2018', // Dark brown for text
      secondary: '#5d4b40', // Medium brown for secondary text
    },
    status: {
      // Custom colors for reading status
      notRead: '#d32f2f', // Red for not read in 2+ weeks
      needsAttention: '#ed6c02', // Orange for read in last 2 weeks
      recentlyRead: '#2e7d32', // Green for read in last week
    },
  },
  typography: {
    fontFamily: [
      'Merriweather',
      'Georgia',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: {
      fontFamily: 'Merriweather, Georgia, serif',
    },
    h2: {
      fontFamily: 'Merriweather, Georgia, serif',
    },
    h3: {
      fontFamily: 'Merriweather, Georgia, serif',
    },
    h4: {
      fontFamily: 'Merriweather, Georgia, serif',
    },
    h5: {
      fontFamily: 'Merriweather, Georgia, serif',
    },
    h6: {
      fontFamily: 'Merriweather, Georgia, serif',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          minHeight: '100vh',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backdropFilter: 'blur(10px)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          padding: '10px 15px',
          fontWeight: 600,
        },
      },
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          backdropFilter: 'blur(10px)',
          background: 'rgba(255, 255, 255, 0.85)',
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
          background: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(10px)',
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
});

export default theme;