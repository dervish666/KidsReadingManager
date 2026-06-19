import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Chip,
  Link,
  Button,
  ToggleButton,
  ToggleButtonGroup,
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
import PaymentIcon from '@mui/icons-material/Payment';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import TuneIcon from '@mui/icons-material/Tune';
import Settings from './Settings';
import DataManagement from './DataManagement';
import AISettings from './AISettings';
import BookMetadataSettings from './BookMetadataSettings';
import MetadataManagement from './MetadataManagement';
import DuplicateBooks from './DuplicateBooks';
import UserManagement from './UserManagement';
import SchoolManagement from './SchoolManagement';
import SupportTicketManager from './SupportTicketManager';
import BillingDashboard from './BillingDashboard';
import PlatformSettings from './PlatformSettings';
import SupportModal from './SupportModal';
import { useAuth } from '../contexts/AuthContext';

// Owner Platform area → "Book Catalogue" tab: the cross-school catalogue tools.
// MetadataManagement operates across all schools (selectable), and DuplicateBooks
// dedupes the global catalogue — both are owner-only, so this panel renders inside
// the owner-only Platform area without further role checks.
const PlatformCataloguePanel = () => (
  <>
    <MetadataManagement />
    <Box sx={{ mt: 3 }}>
      <DuplicateBooks />
    </Box>
  </>
);

// School area (admin + owner): everything scoped to the active school.
const SCHOOL_TABS = [
  { label: 'Application Settings', icon: <SettingsIcon />, component: Settings },
  { label: 'Data Management', icon: <StorageIcon />, component: DataManagement },
  { label: 'AI', icon: <SmartToyIcon />, component: AISettings },
  { label: 'Book Metadata', icon: <MenuBookIcon />, component: BookMetadataSettings },
  { label: 'User Management', icon: <PeopleIcon />, component: UserManagement },
];

// Platform area (owner only): cross-school / business operations.
const PLATFORM_TABS = [
  { label: 'Schools', icon: <SchoolIcon />, component: SchoolManagement },
  { label: 'Book Catalogue', icon: <MenuBookIcon />, component: PlatformCataloguePanel },
  { label: 'AI Keys', icon: <VpnKeyIcon />, component: PlatformSettings },
  { label: 'Billing', icon: <PaymentIcon />, component: BillingDashboard },
  { label: 'Support Tickets', icon: <SupportAgentIcon />, component: SupportTicketManager },
];

const SettingsPage = () => {
  const [currentTab, setCurrentTab] = useState(0);
  const { user } = useAuth();

  // Only owners get the Platform area (cross-school operator tools). The Settings
  // page itself is admin+owner only (gated by `adminOnly` in App.js nav).
  const isOwner = user?.role === 'owner';
  const [area, setArea] = useState('school'); // 'school' | 'platform'
  const [supportOpen, setSupportOpen] = useState(false);

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
  };

  const handleAreaChange = (event, newArea) => {
    // ToggleButtonGroup fires null when the active button is re-clicked — ignore.
    if (newArea && newArea !== area) {
      setArea(newArea);
      setCurrentTab(0);
    }
  };

  const tabs = isOwner && area === 'platform' ? PLATFORM_TABS : SCHOOL_TABS;
  // Guard against a stale index if the active tab set ever shrinks.
  const safeTab = currentTab >= tabs.length ? 0 : currentTab;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography
          variant="h4"
          component="h1"
          sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: 'text.primary' }}
        >
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
        {/* Owner-only School ↔ Platform switch. School = this school's settings
            (admin + owner); Platform = cross-school operator tools (owner only). */}
        {isOwner && (
          <ToggleButtonGroup
            value={area}
            exclusive
            onChange={handleAreaChange}
            color="primary"
            sx={{
              mb: 2,
              '& .MuiToggleButton-root': {
                fontFamily: '"Nunito", sans-serif',
                fontWeight: 700,
                textTransform: 'none',
                px: 3,
                py: 1,
                borderRadius: 3,
              },
            }}
            aria-label="Settings area"
          >
            <ToggleButton value="school">
              <SchoolIcon sx={{ mr: 1, fontSize: 20 }} />
              School Settings
            </ToggleButton>
            <ToggleButton value="platform">
              <TuneIcon sx={{ mr: 1, fontSize: 20 }} />
              Platform
            </ToggleButton>
          </ToggleButtonGroup>
        )}

        <Paper
          sx={{
            mb: 3,
            overflow: 'hidden',
            borderRadius: 4,
            backgroundColor: 'background.paper',
          }}
        >
          <Tabs
            value={safeTab}
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
                minHeight: 64,
              },
            }}
          >
            {tabs.map((tab) => (
              <Tab key={tab.label} icon={tab.icon} iconPosition="start" label={tab.label} />
            ))}
          </Tabs>
        </Paper>

        <Box sx={{ p: 0 }}>
          {tabs[safeTab]?.component && React.createElement(tabs[safeTab].component)}
        </Box>
      </Box>

      <Box
        sx={{
          mt: 3,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
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
            sx={{
              fontFamily: '"Nunito", sans-serif',
              fontWeight: 700,
              color: 'text.primary',
              mb: 0.5,
            }}
          >
            Need help?
          </Typography>
          <Typography
            variant="body2"
            sx={{
              fontFamily: '"DM Sans", sans-serif',
              color: 'text.secondary',
              mb: 1.5,
              fontSize: '0.85rem',
            }}
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
              '&:hover': {
                borderColor: 'primary.main',
                backgroundColor: 'rgba(107, 142, 107, 0.05)',
              },
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

      <SupportModal
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        currentPage="Settings"
      />
    </Box>
  );
};

export default SettingsPage;
