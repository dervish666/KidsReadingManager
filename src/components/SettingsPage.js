import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import StorageIcon from '@mui/icons-material/Storage';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import Settings from './Settings';
import DataManagement from './DataManagement';
import AISettings from './AISettings';
import BookMetadataSettings from './BookMetadataSettings';

const SettingsPage = () => {
  const [currentTab, setCurrentTab] = useState(0);

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#332F3A' }}>
          Settings & Data
        </Typography>
      </Box>
      
      <Box>
        <Paper sx={{ 
          mb: 3, 
          overflow: 'hidden', 
          borderRadius: 4, 
          backgroundColor: 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.4)'
        }}>
          <Tabs
            value={currentTab}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            indicatorColor="primary"
            textColor="primary"
            aria-label="Settings tabs"
            sx={{
              '& .MuiTab-root': {
                fontFamily: '"Nunito", sans-serif',
                fontWeight: 700,
                textTransform: 'none',
                fontSize: '1rem',
                minHeight: 64
              }
            }}
          >
            <Tab icon={<SettingsIcon />} iconPosition="start" label="Application Settings" />
            <Tab icon={<StorageIcon />} iconPosition="start" label="Data Management" />
            <Tab icon={<SmartToyIcon />} iconPosition="start" label="AI Integration" />
            <Tab icon={<MenuBookIcon />} iconPosition="start" label="Book Metadata" />
          </Tabs>
        </Paper>
        
        <Box sx={{ p: 0 }}>
          {currentTab === 0 && <Settings />}
          {currentTab === 1 && <DataManagement />}
          {currentTab === 2 && <AISettings />}
          {currentTab === 3 && <BookMetadataSettings />}
        </Box>
      </Box>
    </Box>
  );
};

export default SettingsPage;