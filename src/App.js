import React, { useState } from 'react';
import { Box, Container, Paper, CssBaseline, ThemeProvider } from '@mui/material';
import theme from './styles/theme';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
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

// Import custom navigation icons
import iconStudents from './assets/icon-students.png';
import iconReading from './assets/icon-reading.png';
import iconRecord from './assets/icon-record.png';
import iconStats from './assets/icon-stats.png';
import iconRecommend from './assets/icon-recommend.png';
import iconBooks from './assets/icon-books.png';

// Import bookshelf images
import bookshelfLeft from './assets/bookshelf-left.png';
import bookshelfRight from './assets/bookshelf-right.png';

// Custom icon component for navigation
const NavIcon = ({ src, alt, selected }) => (
  <Box
    component="img"
    src={src}
    alt={alt}
    sx={{
      width: 28,
      height: 28,
      objectFit: 'contain',
      filter: selected ? 'none' : 'grayscale(30%) opacity(0.7)',
      transition: 'all 0.2s ease',
    }}
  />
);

// Bookshelf border component using custom images
const BookshelfBorder = ({ side }) => (
  <Box
    sx={{
      position: 'fixed',
      top: 0,
      bottom: 80, // Leave space for bottom nav
      [side]: 0,
      width: { xs: '60px', sm: '80px', md: '100px', lg: '120px' },
      display: { xs: 'none', md: 'block' }, // Hide on mobile/tablet
      zIndex: 0,
      pointerEvents: 'none',
      overflow: 'hidden',
    }}
  >
    <Box
      component="img"
      src={side === 'left' ? bookshelfLeft : bookshelfRight}
      alt={`Bookshelf ${side}`}
      sx={{
        position: 'absolute',
        top: 0,
        [side]: 0,
        height: '100%',
        width: 'auto',
        objectFit: 'contain',
        objectPosition: side === 'left' ? 'left top' : 'right top',
      }}
    />
  </Box>
);

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
        backgroundColor: '#F5F0E8',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'none',
        pb: '80px',
        '@media (max-width: 600px)': {
          pb: '90px',
        },
      }}
    >
      {/* Animated Background Blobs - Warm tones */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div style={{
          position: 'fixed',
          top: '-10%',
          left: '-10%',
          width: '60vh',
          height: '60vh',
          borderRadius: '50%',
          filter: 'blur(80px)',
          background: 'rgba(139, 115, 85, 0.08)',
          zIndex: -1,
          animation: 'clay-float 8s ease-in-out infinite'
        }}></div>
        <div style={{
          position: 'fixed',
          top: '20%',
          right: '-10%',
          width: '60vh',
          height: '60vh',
          borderRadius: '50%',
          filter: 'blur(80px)',
          background: 'rgba(107, 142, 107, 0.06)',
          zIndex: -1,
          animation: 'clay-float-delayed 10s ease-in-out infinite'
        }}></div>
        <div style={{
          position: 'fixed',
          bottom: '-10%',
          left: '20%',
          width: '60vh',
          height: '60vh',
          borderRadius: '50%',
          filter: 'blur(80px)',
          background: 'rgba(212, 165, 116, 0.06)',
          zIndex: -1,
          animation: 'clay-float 8s ease-in-out infinite'
        }}></div>
      </div>

      {/* Bookshelf Border Decorations */}
      <BookshelfBorder side="left" />
      <BookshelfBorder side="right" />

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
          // Account for bookshelf borders on desktop
          ml: { xs: 0, md: '100px', lg: '120px' },
          mr: { xs: 0, md: '100px', lg: '120px' },
          maxWidth: { xs: '100%', md: 'calc(100% - 200px)', lg: 'calc(100% - 240px)' },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            flexGrow: 1,
            p: { xs: 2, sm: 3 },
            borderRadius: '16px',
            overflow: 'auto',
            mb: 0,
            backgroundColor: 'rgba(255, 254, 249, 0.85)',
            backdropFilter: 'blur(20px)',
            height: 'calc(100vh - 140px)',
            minHeight: 'calc(100vh - 140px)',
            border: '1px solid rgba(139, 115, 85, 0.1)',
            boxShadow: '0 8px 32px rgba(139, 115, 85, 0.08), 0 2px 8px rgba(0, 0, 0, 0.03)',
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
          backgroundColor: 'rgba(255, 254, 249, 0.98)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(139, 115, 85, 0.1)',
          boxShadow: '0 -4px 20px rgba(139, 115, 85, 0.06)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          transform: 'translateZ(0)',
          WebkitTransform: 'translateZ(0)',
          willChange: 'transform',
          pb: 'env(safe-area-inset-bottom)',
          overflow: 'hidden',
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
            minHeight: '60px',
            pb: 'env(safe-area-inset-bottom)',
          }}
        >
          <BottomNavigationAction label="Students" icon={<NavIcon src={iconStudents} alt="Students" selected={currentTab === 0} />} />
          <BottomNavigationAction label="Reading" icon={<NavIcon src={iconReading} alt="Reading" selected={currentTab === 1} />} />
          <BottomNavigationAction label="Record" icon={<NavIcon src={iconRecord} alt="Record" selected={currentTab === 2} />} />
          <BottomNavigationAction label="Stats" icon={<NavIcon src={iconStats} alt="Stats" selected={currentTab === 3} />} />
          <BottomNavigationAction label="Recommend" icon={<NavIcon src={iconRecommend} alt="Recommend" selected={currentTab === 4} />} />
          <BottomNavigationAction label="Books" icon={<NavIcon src={iconBooks} alt="Books" selected={currentTab === 5} />} />
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
