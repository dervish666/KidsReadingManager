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
import Settings from './Settings';
import DataManagement from './DataManagement';
import AISettings from './AISettings';

const SettingsPage = () => {
  const [currentTab, setCurrentTab] = useState(0);

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" component="h1">
          Settings & Data
        </Typography>
      </Box>
      
      <Box>
        <Paper sx={{ mb: 3, overflow: 'hidden' }}>
          <Tabs
            value={currentTab}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            indicatorColor="primary"
            textColor="primary"
            aria-label="Settings tabs"
          >
            <Tab icon={<SettingsIcon />} label="Application Settings" />
            <Tab icon={<StorageIcon />} label="Data Management" />
            <Tab icon={<SmartToyIcon />} label="AI Integration" />
          </Tabs>
        </Paper>
        
        <Box sx={{ p: 2 }}>
          {currentTab === 0 && <Settings />}
          {currentTab === 1 && <DataManagement />}
          {currentTab === 2 && <AISettings />}
        </Box>
      </Box>
    </Box>
  );
};

export default SettingsPage;