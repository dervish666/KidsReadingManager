import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Chip,
  Link,
  Button
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import PolicyIcon from '@mui/icons-material/Policy';
import SettingsIcon from '@mui/icons-material/Settings';
import StorageIcon from '@mui/icons-material/Storage';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PeopleIcon from '@mui/icons-material/People';
import SchoolIcon from '@mui/icons-material/School';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import Settings from './Settings';
import DataManagement from './DataManagement';
import AISettings from './AISettings';
import BookMetadataSettings from './BookMetadataSettings';
import UserManagement from './UserManagement';
import SchoolManagement from './SchoolManagement';
import SupportTicketManager from './SupportTicketManager';
import SupportModal from './SupportModal';
import { useAppContext } from '../contexts/AppContext';

const SettingsPage = () => {
  const [currentTab, setCurrentTab] = useState(0);
  const { canManageUsers, user } = useAppContext();
  
  // Only owners can manage schools
  const isOwner = user?.role === 'owner';
  const [supportOpen, setSupportOpen] = useState(false);

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
        <Typography variant="h4" component="h1" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: 'text.primary' }}>
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
              color: 'text.primary',
              '& .MuiChip-icon': {
                color: 'primary.main',
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
          backgroundColor: 'background.paper'
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
            {isOwner && (
              <Tab icon={<SupportAgentIcon />} iconPosition="start" label="Support Tickets" />
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
          {isOwner && currentTab === (canManageUsers ? 6 : 5) && <SupportTicketManager />}
        </Box>
      </Box>

      <Box sx={{ mt: 3, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
        <Box
          sx={{
            backgroundColor: 'rgba(107, 142, 107, 0.06)',
            borderRadius: '12px',
            p: 2.5,
            maxWidth: 400,
            width: '100%',
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, color: 'text.primary', mb: 0.5 }}
          >
            Need help?
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontFamily: '"DM Sans", sans-serif', color: 'text.secondary', mb: 1.5, fontSize: '0.85rem' }}
          >
            Get in touch and we'll help you get set up.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<HelpOutlineIcon />}
            onClick={() => setSupportOpen(true)}
            sx={{
              color: 'primary.main',
              borderColor: 'rgba(107, 142, 107, 0.3)',
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: '10px',
              '&:hover': { borderColor: 'primary.main', backgroundColor: 'rgba(107, 142, 107, 0.05)' },
            }}
          >
            Contact support
          </Button>
        </Box>

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
            '&:hover': { color: 'primary.main' },
          }}
        >
          <PolicyIcon sx={{ fontSize: 16 }} />
          Privacy Policy
        </Link>
      </Box>

      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </Box>
  );
};

export default SettingsPage;