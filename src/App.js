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
        background: 'linear-gradient(135deg, #DFE6E9 0%, #F5F6FA 100%)',
        backgroundImage: `
          radial-gradient(circle at 10% 20%, rgba(108, 92, 231, 0.05) 0%, transparent 20%),
          radial-gradient(circle at 90% 80%, rgba(0, 206, 201, 0.05) 0%, transparent 20%),
          linear-gradient(135deg, #DFE6E9 0%, #F5F6FA 100%)
        `,
      }}
    >
      <Header currentTab={currentTab} onTabChange={setCurrentTab} />

      <Container
        component="main"
        className="app-container"
        sx={{
          flexGrow: 1,
          py: { xs: 2, sm: 3 },
          px: { xs: 1, sm: 3 },
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Paper
          elevation={0}
          sx={{
            flexGrow: 1,
            p: { xs: 2, sm: 4 },
            borderRadius: { xs: 2, sm: 3 },
            overflow: 'auto',
            mb: { xs: 10, sm: 9 },
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(10px)',
            minHeight: 'calc(100vh - 140px)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            '@media (max-width: 600px)': {
              minHeight: 'calc(100vh - 160px)',
              p: 2,
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
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.5)',
          boxShadow: '0 -5px 20px rgba(0,0,0,0.05)',
        }}
        elevation={0}
      >
        <BottomNavigation
          value={currentTab}
          onChange={(event, newValue) => {
            setCurrentTab(newValue);
          }}
          showLabels
        >
          <BottomNavigationAction label="Students" icon={<PeopleIcon />} />
          <BottomNavigationAction label="Reading" icon={<MenuBookIcon />} />
          <BottomNavigationAction label="Home" icon={<HomeIcon />} />
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