import React, { useState } from 'react';
import { AppBar, Toolbar, Typography, IconButton, Box, FormControl, Select, MenuItem, Button, Chip, Menu, CircularProgress } from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import FilterListIcon from '@mui/icons-material/FilterList';
import LogoutIcon from '@mui/icons-material/Logout';
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
import packageJson from '../../package.json';
import { useAppContext } from '../contexts/AppContext';

const Header = () => {
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
      position="sticky"
      elevation={0}
      sx={{
        top: 0,
        background: 'rgba(255, 255, 255, 0.9)',
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
      <Toolbar sx={{ minHeight: { xs: 64, sm: 72 } }}>
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
          <MenuBookIcon sx={{ color: 'white', fontSize: 22 }} />
        </Box>
        
        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}>
          <Typography
            variant="h5"
            component="div"
            sx={{
              fontFamily: '"Nunito", sans-serif',
              fontWeight: 800,
              color: '#4A4A4A',
              fontSize: { xs: '1.25rem', sm: '1.5rem' },
              mr: { xs: 1, sm: 3 },
              letterSpacing: '-0.025em',
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
              color: '#7A7A7A',
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
                  color: '#4A4A4A',
                  fontWeight: 600,
                  fontFamily: '"DM Sans", sans-serif',
                },
                '& .MuiSelect-icon': {
                  color: '#6B8E6B',
                },
              }}
            >
              <Select
                value={globalClassFilter}
                onChange={handleClassFilterChange}
                displayEmpty
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
            color: '#6B8E6B',
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
          <Box sx={{ display: 'flex', alignItems: 'center', ml: 2 }}>
            {/* User info - only show in multi-tenant mode */}
            {user && (
              <Box sx={{
                display: { xs: 'none', sm: 'flex' },
                alignItems: 'center',
                mr: 1,
                backgroundColor: 'rgba(107, 142, 107, 0.05)',
                px: 1.5,
                py: 0.5,
                borderRadius: '6px',
              }}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: '#4A4A4A',
                    fontSize: '0.75rem'
                  }}
                >
                  {user.name}
                </Typography>
                <Chip
                  label={user.role || 'User'}
                  size="small"
                  sx={{
                    ml: 1,
                    height: 18,
                    fontSize: '0.65rem',
                    backgroundColor: '#6B8E6B',
                    color: 'white',
                    '& .MuiChip-label': {
                      px: 1,
                      padding: 0,
                    }
                  }}
                />
              </Box>
            )}

            {/* School Selector - Only for owners with multiple organizations */}
            {user?.role === 'owner' && availableOrganizations.length > 1 && (
              <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                <Chip
                  icon={switchingOrganization ? (
                    <CircularProgress size={14} sx={{ color: 'white' }} />
                  ) : (
                    <SchoolOutlined sx={{ fontSize: 16 }} />
                  )}
                  label={organization?.name || 'Select School'}
                  onClick={handleSchoolMenuClick}
                  sx={{
                    backgroundColor: '#6B8E6B',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    '&:hover': {
                      backgroundColor: '#5A7D5A',
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

            <Button
              variant="outlined"
              size="small"
              onClick={logout}
              startIcon={<LogoutIcon sx={{ fontSize: 16 }} />}
              sx={{
                color: '#6B8E6B',
                borderColor: 'rgba(107, 142, 107, 0.3)',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'none',
                px: 1.5,
                py: 0.5,
                minHeight: 32,
                '&:hover': {
                  borderColor: '#6B8E6B',
                  backgroundColor: 'rgba(107, 142, 107, 0.05)',
                },
              }}
            >
              Logout
            </Button>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
};

export default Header;