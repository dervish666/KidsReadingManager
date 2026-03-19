import React, { useState } from 'react';
import { AppBar, Toolbar, Typography, Box, FormControl, Select, MenuItem, Button, Chip, Menu, CircularProgress, IconButton } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import TallyLogo from './TallyLogo';
import LogoutIcon from '@mui/icons-material/Logout';
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import packageJson from '../../package.json';
import { useAppContext } from '../contexts/AppContext';
import SupportModal from './SupportModal';

const TAB_NAMES = ['Students', 'School Reading', 'Home Reading', 'Stats', 'Recommend', 'Books', 'Settings'];

const Header = ({ currentTab }) => {
  const {
    classes,
    globalClassFilter,
    setGlobalClassFilter,
    isAuthenticated,
    logout,
    user,
    availableOrganizations,
    activeOrganizationId,
    switchOrganization,
    switchingOrganization,
    organization,
  } = useAppContext();

  // State for school selector dropdown
  const [schoolAnchorEl, setSchoolAnchorEl] = useState(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const schoolMenuOpen = Boolean(schoolAnchorEl);

  const handleSchoolMenuClick = (event) => {
    setSchoolAnchorEl(event.currentTarget);
  };

  const handleSchoolMenuClose = () => {
    setSchoolAnchorEl(null);
  };

  const handleSchoolSelect = (orgId) => {
    switchOrganization(orgId);
    handleSchoolMenuClose();
  };

  // Get active (non-disabled) classes
  const activeClasses = classes.filter(cls => !cls.disabled);
  
  const handleClassFilterChange = (event) => {
    setGlobalClassFilter(event.target.value);
  };
  
  // Format class name with teacher if available
  const formatClassName = (cls) => {
    if (cls.teacherName) {
      return `${cls.name} - ${cls.teacherName}`;
    }
    return cls.name;
  };

  // Get display name for current filter
  const getFilterDisplayName = () => {
    if (globalClassFilter === 'all') return 'All Classes';
    if (globalClassFilter === 'unassigned') return 'Unassigned';
    const selectedClass = classes.find(cls => cls.id === globalClassFilter);
    return selectedClass ? formatClassName(selectedClass) : 'All Classes';
  };

  return (
    <AppBar
      component="header"
      position="sticky"
      elevation={0}
      sx={{
        top: 0,
        background: 'rgba(255, 255, 255, 0.9)',
        WebkitBackdropFilter: 'blur(20px)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.5)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
        px: { xs: 2, sm: 3 },
        pt: 'env(safe-area-inset-top)',
        zIndex: (theme) => theme.zIndex.appBar,
        minHeight: { xs: 64, sm: 72 },
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 16,
        mb: 2,
      }}
    >
      <Toolbar sx={{ minHeight: { xs: 64, sm: 72 }, flexWrap: 'wrap', gap: 0.5 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
            borderRadius: '10px',
            width: 42,
            height: 42,
            mr: 2,
            boxShadow: '0 4px 12px rgba(107, 142, 107, 0.3)',
          }}
        >
          <TallyLogo size={22} />
        </Box>
        
        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}>
          <Typography
            variant="h5"
            component="div"
            sx={{
              fontFamily: '"Nunito", sans-serif',
              fontWeight: 800,
              color: 'text.primary',
              fontSize: { xs: '1.1rem', sm: '1.5rem' },
              mr: { xs: 1, sm: 3 },
              letterSpacing: '-0.025em',
              whiteSpace: 'nowrap',
            }}
          >
            Tally Reading
          </Typography>
          
          {/* Global Class Filter Dropdown */}
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            mr: { xs: 1, sm: 2 },
            ml: 'auto',
          }}>
            <FilterListIcon sx={{
              mr: 1,
              fontSize: { xs: '1rem', sm: '1.25rem' },
              color: 'text.secondary',
              display: { xs: 'none', sm: 'block' }
            }} />
            <FormControl
              size="small"
              sx={{
                minWidth: { xs: 120, sm: 160 },
                '& .MuiOutlinedInput-root': {
                  borderRadius: '10px',
                  backgroundColor: '#FAF8F3',
                  boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.04)',
                  border: '1px solid rgba(139, 115, 85, 0.15)',
                  '& fieldset': {
                    border: 'none',
                  },
                  '&:hover': {
                    backgroundColor: '#FAF8F3',
                    border: '1px solid rgba(107, 142, 107, 0.3)',
                  },
                  '&.Mui-focused': {
                    backgroundColor: '#ffffff',
                    border: '1px solid rgba(107, 142, 107, 0.5)',
                    boxShadow: '0 0 0 3px rgba(107, 142, 107, 0.15)',
                  },
                },
                '& .MuiSelect-select': {
                  color: 'text.primary',
                  fontWeight: 600,
                  fontFamily: '"DM Sans", sans-serif',
                },
                '& .MuiSelect-icon': {
                  color: 'primary.main',
                },
              }}
            >
              <Select
                value={globalClassFilter}
                onChange={handleClassFilterChange}
                displayEmpty
                aria-label="Filter by class"
                renderValue={() => getFilterDisplayName()}
                sx={{
                  fontSize: { xs: '0.875rem', sm: '0.9rem' },
                  '& .MuiSelect-select': {
                    py: { xs: 1, sm: 1.25 },
                    px: { xs: 1.5, sm: 2 },
                  },
                }}
              >
                <MenuItem value="all" sx={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 500 }}>All Classes</MenuItem>
                <MenuItem value="unassigned" sx={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 500 }}>Unassigned</MenuItem>
                {activeClasses.map((cls) => (
                  <MenuItem key={cls.id} value={cls.id} sx={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 500 }}>
                    {formatClassName(cls)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          
        </Box>
        <Typography
          variant="caption"
          sx={{
            fontFamily: '"DM Sans", sans-serif',
            fontWeight: 700,
            color: 'primary.main',
            fontSize: { xs: '0.7rem', sm: '0.75rem' },
            ml: 2,
            backgroundColor: 'rgba(107, 142, 107, 0.1)',
            px: 1.5,
            py: 0.5,
            borderRadius: '6px',
            display: { xs: 'none', sm: 'block' },
          }}
        >
          v{packageJson.version}
        </Typography>
        
        {/* Logout Section - only show when authenticated */}
        {isAuthenticated && (
          <Box sx={{ display: 'flex', alignItems: 'center', ml: 'auto', gap: 1 }}>
            {/* School Selector - Only for owners with multiple organizations */}
            {user?.role === 'owner' && availableOrganizations.length > 1 && (
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Chip
                  icon={switchingOrganization ? (
                    <CircularProgress size={14} sx={{ color: 'white' }} />
                  ) : (
                    <SchoolOutlined sx={{ fontSize: 16 }} />
                  )}
                  label={organization?.name || 'Select School'}
                  onClick={handleSchoolMenuClick}
                  sx={{
                    backgroundColor: 'primary.main',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    '&:hover': {
                      backgroundColor: 'primary.dark',
                    },
                    '& .MuiChip-icon': {
                      color: 'white',
                    },
                  }}
                />
                <Menu
                  anchorEl={schoolAnchorEl}
                  open={schoolMenuOpen}
                  onClose={handleSchoolMenuClose}
                  anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                  }}
                  transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                  }}
                  PaperProps={{
                    sx: {
                      mt: 1,
                      minWidth: 200,
                      borderRadius: '10px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    },
                  }}
                >
                  {availableOrganizations.map((org) => (
                    <MenuItem
                      key={org.id}
                      onClick={() => handleSchoolSelect(org.id)}
                      selected={activeOrganizationId ? org.id === activeOrganizationId : org.id === organization?.id}
                      sx={{
                        fontFamily: '"DM Sans", sans-serif',
                        fontWeight: 500,
                        '&.Mui-selected': {
                          backgroundColor: 'rgba(107, 142, 107, 0.15)',
                        },
                        '&.Mui-selected:hover': {
                          backgroundColor: 'rgba(107, 142, 107, 0.25)',
                        },
                      }}
                    >
                      {org.name}
                    </MenuItem>
                  ))}
                </Menu>
              </Box>
            )}

            <IconButton
              onClick={() => setSupportOpen(true)}
              size="small"
              aria-label="Contact support"
              sx={{
                color: 'primary.main',
                '&:hover': { backgroundColor: 'rgba(107, 142, 107, 0.08)' },
              }}
            >
              <HelpOutlineIcon sx={{ fontSize: 20 }} />
            </IconButton>

            <Button
              variant="outlined"
              size="small"
              onClick={logout}
              startIcon={<LogoutIcon sx={{ fontSize: 16 }} />}
              sx={{
                color: 'primary.main',
                borderColor: 'rgba(107, 142, 107, 0.3)',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'none',
                px: 1.5,
                py: 0.5,
                minHeight: 32,
                '&:hover': {
                  borderColor: 'primary.main',
                  backgroundColor: 'rgba(107, 142, 107, 0.05)',
                },
              }}
            >
              Logout
            </Button>
          </Box>
        )}
      </Toolbar>
      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} currentPage={TAB_NAMES[currentTab] || 'Unknown'} />
    </AppBar>
  );
};

export default Header;