import React from 'react';
import { AppBar, Toolbar, Typography, IconButton, Box, FormControl, Select, MenuItem } from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import FilterListIcon from '@mui/icons-material/FilterList';
import packageJson from '../../package.json';
import { useAppContext } from '../contexts/AppContext';

const Header = () => {
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
            background: 'linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)',
            borderRadius: '10px',
            width: 42,
            height: 42,
            mr: 2,
            boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
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
              color: '#332F3A',
              fontSize: { xs: '1.25rem', sm: '1.5rem' },
              mr: { xs: 1, sm: 3 },
              letterSpacing: '-0.025em',
            }}
          >
            Kids Reading Manager
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
              color: '#635F69',
              display: { xs: 'none', sm: 'block' }
            }} />
            <FormControl
              size="small"
              sx={{
                minWidth: { xs: 120, sm: 160 },
                '& .MuiOutlinedInput-root': {
                  borderRadius: '10px',
                  backgroundColor: '#F8F6FC',
                  boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.04)',
                  border: '1px solid rgba(160, 150, 180, 0.15)',
                  '& fieldset': {
                    border: 'none',
                  },
                  '&:hover': {
                    backgroundColor: '#F8F6FC',
                    border: '1px solid rgba(124, 58, 237, 0.3)',
                  },
                  '&.Mui-focused': {
                    backgroundColor: '#ffffff',
                    border: '1px solid rgba(124, 58, 237, 0.5)',
                    boxShadow: '0 0 0 3px rgba(124, 58, 237, 0.15)',
                  },
                },
                '& .MuiSelect-select': {
                  color: '#332F3A',
                  fontWeight: 600,
                  fontFamily: '"DM Sans", sans-serif',
                },
                '& .MuiSelect-icon': {
                  color: '#7C3AED',
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
                    {cls.name}
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
            color: '#7C3AED',
            fontSize: { xs: '0.7rem', sm: '0.75rem' },
            ml: 2,
            backgroundColor: 'rgba(124, 58, 237, 0.1)',
            px: 1.5,
            py: 0.5,
            borderRadius: '6px',
            display: { xs: 'none', sm: 'block' },
          }}
        >
          v{packageJson.version}
        </Typography>
      </Toolbar>
    </AppBar>
  );
};

export default Header;