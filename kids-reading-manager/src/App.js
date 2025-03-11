import React, { useState } from 'react';
import { Box, Container, Paper } from '@mui/material';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import PeopleIcon from '@mui/icons-material/People';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import BarChartIcon from '@mui/icons-material/BarChart';
import Header from './components/Header';
import { AppProvider } from './contexts/AppContext';
import StudentList from './components/students/StudentList';
import SessionForm from './components/sessions/SessionForm';
import ReadingStats from './components/stats/ReadingStats';

function App() {
  const [currentTab, setCurrentTab] = useState(0);

  // Render the current tab content
  const renderTabContent = () => {
    switch (currentTab) {
      case 0:
        return <StudentList />;
      case 1:
        return <SessionForm />;
      case 2:
        return <ReadingStats />;
      default:
        return <StudentList />;
    }
  };

  return (
    <AppProvider>
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        minHeight: '100vh',
        bgcolor: 'background.default'
      }}>
        <Header />
        
        <Container component="main" sx={{ 
          flexGrow: 1, 
          py: 2,
          display: 'flex',
          flexDirection: 'column'
        }}>
          <Paper 
            elevation={0}
            sx={{ 
              flexGrow: 1, 
              p: 2, 
              borderRadius: 2,
              overflow: 'auto',
              mb: 8 // Add margin to bottom to avoid content being hidden by navigation
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
            zIndex: 1100
          }} 
          elevation={3}
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
            <BottomNavigationAction label="Stats" icon={<BarChartIcon />} />
          </BottomNavigation>
        </Paper>
      </Box>
    </AppProvider>
  );
}

export default App;