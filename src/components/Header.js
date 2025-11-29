import React from 'react';
import { AppBar, Toolbar, Typography, IconButton, Box, Button, FormControl, Select, MenuItem } from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import StarIcon from '@mui/icons-material/Star';
import FilterListIcon from '@mui/icons-material/FilterList';
import packageJson from '../../package.json';
import { useAppContext } from '../contexts/AppContext';

const Header = ({ currentTab, onTabChange }) => {
  const { classes, globalClassFilter, setGlobalClassFilter } = useAppContext();
  
  // Get active (non-disabled) classes
  const activeClasses = classes.filter(cls => !cls.disabled);
  
  const handleClassFilterChange = (event) => {
    setGlobalClassFilter(event.target.value);
  };
  
  // Get display name for current filter
  const getFilterDisplayName = () => {
    if (globalClassFilter === 'all') return 'All Classes';
    if (globalClassFilter === 'unassigned') return 'Unassigned';
    const selectedClass = classes.find(cls => cls.id === globalClassFilter);
    return selectedClass ? selectedClass.name : 'All Classes';
  };

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        top: 0,
        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
        backdropFilter: 'saturate(120%) blur(8px)',
        borderBottom: '1px solid rgba(15,23,42,0.06)',
        px: { xs: 2, sm: 3 },
        pt: 'env(safe-area-inset-top)',
        zIndex: (theme) => theme.zIndex.appBar,
        minHeight: { xs: 56, sm: 64 },
      }}
    >
      <Toolbar sx={{ minHeight: { xs: 56, sm: 64 } }}>
        <IconButton
          edge="start"
          color="inherit"
          aria-label="menu"
          size="large"
          sx={{ mr: 2, p: { xs: 1.25, sm: 1 } }}
        >
          <MenuBookIcon />
        </IconButton>
        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}>
          <Typography
            variant="h6"
            component="div"
            sx={{
              fontFamily: (theme) => theme.typography.fontFamily,
              fontWeight: 600,
              letterSpacing: '0.25px',
              fontSize: { xs: '1rem', sm: '1.15rem' },
              mr: { xs: 1, sm: 3 },
            }}
          >
            Kids Reading Manager
          </Typography>
          
          {/* Global Class Filter Dropdown */}
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            mr: { xs: 1, sm: 2 }
          }}>
            <FilterListIcon sx={{
              mr: 0.5,
              fontSize: { xs: '1rem', sm: '1.25rem' },
              opacity: 0.9,
              display: { xs: 'none', sm: 'block' }
            }} />
            <FormControl
              size="small"
              sx={{
                minWidth: { xs: 100, sm: 150 },
                '& .MuiOutlinedInput-root': {
                  color: 'white',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  '& fieldset': {
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                  },
                  '&:hover fieldset': {
                    borderColor: 'rgba(255, 255, 255, 0.5)',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: 'rgba(255, 255, 255, 0.7)',
                  },
                },
                '& .MuiSelect-icon': {
                  color: 'rgba(255, 255, 255, 0.7)',
                },
              }}
            >
              <Select
                value={globalClassFilter}
                onChange={handleClassFilterChange}
                displayEmpty
                renderValue={() => getFilterDisplayName()}
                sx={{
                  fontSize: { xs: '0.75rem', sm: '0.875rem' },
                  '& .MuiSelect-select': {
                    py: { xs: 0.5, sm: 0.75 },
                    px: { xs: 1, sm: 1.5 },
                  },
                }}
              >
                <MenuItem value="all">All Classes</MenuItem>
                <MenuItem value="unassigned">Unassigned</MenuItem>
                {activeClasses.map((cls) => (
                  <MenuItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          
          {/* Navigation Links - Hidden on mobile, shown on larger screens */}
          <Box sx={{
            display: { xs: 'none', md: 'flex' },
            gap: 1,
            ml: 'auto',
            mr: 2
          }}>
            <Button
              color="inherit"
              startIcon={<StarIcon />}
              onClick={() => onTabChange && onTabChange(3)}
              sx={{
                fontWeight: currentTab === 3 ? 600 : 400,
                textDecoration: currentTab === 3 ? 'underline' : 'none',
                textUnderlineOffset: '4px',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                },
              }}
            >
              Recommendations
            </Button>
          </Box>
        </Box>
        <Typography
          variant="body2"
          sx={{
            fontFamily: (theme) => theme.typography.fontFamily,
            fontWeight: 500,
            opacity: 0.8,
            fontSize: { xs: '0.75rem', sm: '0.875rem' },
            mr: 2,
          }}
        >
          v{packageJson.version}
        </Typography>
      </Toolbar>
    </AppBar>
  );
};

export default Header;