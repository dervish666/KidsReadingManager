import React, { useState } from 'react';
import { Box, Container, Paper, CssBaseline, ThemeProvider } from '@mui/material';
import theme from './styles/theme';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import PeopleIcon from '@mui/icons-material/People';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import HomeIcon from '@mui/icons-material/Home';
import BarChartIcon from '@mui/icons-material/BarChart';
import StarIcon from '@mui/icons-material/Star';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import SettingsIcon from '@mui/icons-material/Settings';
import Header from './components/Header';
import { AppProvider, useAppContext } from './contexts/AppContext';
import Login from './components/Login';
import StudentList from './components/students/StudentList';
import SessionForm from './components/sessions/SessionForm';
import HomeReadingRegister from './components/sessions/HomeReadingRegister';
import ReadingStats from './components/stats/ReadingStats';
import BookRecommendations from './components/BookRecommendations';
import BookManager from './components/books/BookManager';
import SettingsPage from './components/SettingsPage';

function AppContent() {
  const { isAuthenticated } = useAppContext();
  const [currentTab, setCurrentTab] = useState(0);

  if (!isAuthenticated) {
    return <Login />;
  }

  const renderTabContent = () => {
    switch (currentTab) {
      case 0:
        return <StudentList />;
      case 1:
        return <SessionForm />;
      case 2:
        return <HomeReadingRegister />;
      case 3:
        return <ReadingStats />;
      case 4:
        return <BookRecommendations />;
      case 5:
        return <BookManager />;
      case 6:
        return <SettingsPage />;
      default:
        return <StudentList />;
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#F4F1FA',
        // iOS Safari scrolling fixes
        WebkitOverflowScrolling: 'touch',
        // Prevent any bounce effect
        overscrollBehavior: 'none',
        // Ensure the fixed bottom bar is always visible
        pb: '80px', // Height of the bottom bar
        '@media (max-width: 600px)': {
          pb: '90px', // Extra space for safe area on mobile
        },
      }}
    >
      {/* Animated Background Blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute h-[60vh] w-[60vh] rounded-full blur-3xl bg-[#7C3AED]/10 -top-[10%] -left-[10%] animate-float" style={{ position: 'fixed', top: '-10%', left: '-10%', width: '60vh', height: '60vh', borderRadius: '50%', filter: 'blur(80px)', background: 'rgba(124, 58, 237, 0.1)', zIndex: -1, animation: 'clay-float 8s ease-in-out infinite' }}></div>
        <div className="absolute h-[60vh] w-[60vh] rounded-full blur-3xl bg-[#DB2777]/10 top-[20%] -right-[10%] animate-float-delayed" style={{ position: 'fixed', top: '20%', right: '-10%', width: '60vh', height: '60vh', borderRadius: '50%', filter: 'blur(80px)', background: 'rgba(219, 39, 119, 0.1)', zIndex: -1, animation: 'clay-float-delayed 10s ease-in-out infinite' }}></div>
        <div className="absolute h-[60vh] w-[60vh] rounded-full blur-3xl bg-[#0EA5E9]/10 bottom-[-10%] left-[20%] animate-float" style={{ position: 'fixed', bottom: '-10%', left: '20%', width: '60vh', height: '60vh', borderRadius: '50%', filter: 'blur(80px)', background: 'rgba(14, 165, 233, 0.1)', zIndex: -1, animation: 'clay-float 8s ease-in-out infinite' }}></div>
      </div>

      <Header />

      <Container
        component="main"
        className="app-container"
        sx={{
          flexGrow: 1,
          py: { xs: 2, sm: 3 },
          px: { xs: 1, sm: 3 },
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            flexGrow: 1,
            p: { xs: 2, sm: 3 },
            borderRadius: '16px',
            overflow: 'auto',
            // No margin bottom since the bar is fixed to viewport
            mb: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.75)',
            backdropFilter: 'blur(20px)',
            // Calculate height to account for fixed header and bottom bar
            height: 'calc(100vh - 140px)',
            minHeight: 'calc(100vh - 140px)',
            border: '1px solid rgba(255, 255, 255, 0.5)',
            boxShadow: '0 8px 32px rgba(160, 150, 180, 0.12), 0 2px 8px rgba(0, 0, 0, 0.04)',
            // Safe area support for iOS
            pb: 'calc(env(safe-area-inset-bottom) + 20px)',
            '@media (max-width: 600px)': {
              height: 'calc(100vh - 160px)',
              minHeight: 'calc(100vh - 160px)',
              p: 2,
              borderRadius: '12px',
              pb: 'calc(env(safe-area-inset-bottom) + 90px)',
            },
          }}
        >
          {renderTabContent()}
        </Paper>
      </Container>

      <Paper
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1100,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.5)',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.04)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          // Critical fixes for viewport anchoring
          position: 'fixed',
          bottom: 0,
          // Ensure it stays above all content
          transform: 'translateZ(0)',
          WebkitTransform: 'translateZ(0)',
          willChange: 'transform',
          // Safe area support for iOS devices
          pb: 'env(safe-area-inset-bottom)',
          // Prevent any scrolling behavior
          overflow: 'hidden',
          // Make sure it's always visible
          height: '80px',
          minHeight: '80px',
        }}
        elevation={0}
      >
        <BottomNavigation
          value={currentTab}
          onChange={(event, newValue) => {
            setCurrentTab(newValue);
          }}
          showLabels
          sx={{
            backgroundColor: 'transparent',
            height: 80,
            // Ensure proper touch targets
            minHeight: '60px',
            // Safe area support
            pb: 'env(safe-area-inset-bottom)',
          }}
        >
          <BottomNavigationAction label="Students" icon={<PeopleIcon />} />
          <BottomNavigationAction label="Reading" icon={<MenuBookIcon />} />
          <BottomNavigationAction label="Record" icon={<HomeIcon />} />
          <BottomNavigationAction label="Stats" icon={<BarChartIcon />} />
          <BottomNavigationAction label="Recommend" icon={<StarIcon />} />
          <BottomNavigationAction label="Books" icon={<LibraryBooksIcon />} />
          <BottomNavigationAction label="Settings" icon={<SettingsIcon />} />
        </BottomNavigation>
      </Paper>
    </Box>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ThemeProvider>
  );
}

export default App;