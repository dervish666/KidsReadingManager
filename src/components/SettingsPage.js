import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Chip,
  Link
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import PolicyIcon from '@mui/icons-material/Policy';
import SettingsIcon from '@mui/icons-material/Settings';
import StorageIcon from '@mui/icons-material/Storage';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PeopleIcon from '@mui/icons-material/People';
import SchoolIcon from '@mui/icons-material/School';
import Settings from './Settings';
import DataManagement from './DataManagement';
import AISettings from './AISettings';
import BookMetadataSettings from './BookMetadataSettings';
import UserManagement from './UserManagement';
import SchoolManagement from './SchoolManagement';
import { useAppContext } from '../contexts/AppContext';

const SettingsPage = () => {
  const [currentTab, setCurrentTab] = useState(0);
  const { canManageUsers, user } = useAppContext();
  
  // Only owners can manage schools
  const isOwner = user?.role === 'owner';

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
  };

  // Calculate tab indices based on permissions
  const getTabIndex = (baseIndex) => {
    if (baseIndex <= 3) return baseIndex;
    // User Management tab is only shown for owners/admins
    if (baseIndex === 4 && !canManageUsers) return -1;
    return baseIndex;
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#4A4A4A' }}>
          Settings & Data
        </Typography>
        {user && (
          <Chip
            icon={<PersonIcon sx={{ fontSize: 18 }} />}
            label={`${user.name} · ${user.role || 'User'}`}
            variant="outlined"
            sx={{
              fontFamily: '"DM Sans", sans-serif',
              fontWeight: 600,
              fontSize: '0.8rem',
              borderColor: 'rgba(107, 142, 107, 0.3)',
              color: '#4A4A4A',
              '& .MuiChip-icon': {
                color: '#6B8E6B',
              },
            }}
          />
        )}
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
            {canManageUsers && (
              <Tab icon={<PeopleIcon />} iconPosition="start" label="User Management" />
            )}
            {isOwner && (
              <Tab icon={<SchoolIcon />} iconPosition="start" label="School Management" />
            )}
          </Tabs>
        </Paper>
        
        <Box sx={{ p: 0 }}>
          {currentTab === 0 && <Settings />}
          {currentTab === 1 && <DataManagement />}
          {currentTab === 2 && <AISettings />}
          {currentTab === 3 && <BookMetadataSettings />}
          {canManageUsers && currentTab === 4 && <UserManagement />}
          {isOwner && currentTab === (canManageUsers ? 5 : 4) && <SchoolManagement />}
        </Box>
      </Box>

      <Box sx={{ mt: 3, textAlign: 'center' }}>
        <Link
          href="/privacy"
          target="_blank"
          rel="noopener"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            color: 'rgba(74, 74, 74, 0.5)',
            fontSize: '0.85rem',
            textDecoration: 'none',
            '&:hover': { color: '#6B8E6B' },
          }}
        >
          <PolicyIcon sx={{ fontSize: 16 }} />
          Privacy Policy
        </Link>
      </Box>
    </Box>
  );
};

export default SettingsPage;