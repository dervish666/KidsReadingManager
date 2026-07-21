import React, { useState, useEffect } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  FormControl,
  Select,
  MenuItem,
  Chip,
  Menu,
  CircularProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import TallyLogo from './TallyLogo';
import LogoutIcon from '@mui/icons-material/Logout';
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import packageJson from '../../package.json';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import SupportModal from './SupportModal';
import ReadingNewsTicker from './news/ReadingNewsTicker';

// How often the header re-checks for new celebration events (band-ups, badges)
const TICKER_EVENTS_POLL_MS = 5 * 60 * 1000;

const Header = ({ currentTab, onOpenNews }) => {
  const {
    isAuthenticated,
    logout,
    user,
    availableOrganizations,
    activeOrganizationId,
    switchOrganization,
    switchingOrganization,
    organization,
    fetchWithAuth,
  } = useAuth();
  const { classes } = useData();
  const { globalClassFilter, setGlobalClassFilter } = useUI();

  // State for school selector dropdown
  const [schoolAnchorEl, setSchoolAnchorEl] = useState(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const schoolMenuOpen = Boolean(schoolAnchorEl);

  // Reading News feed (static, same-origin) — drives the header ticker.
  const [newsData, setNewsData] = useState(null);
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let alive = true;
    fetch('/reading-news.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d && (Array.isArray(d.items) || Array.isArray(d.events))) setNewsData(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  // Today's celebration events (band-ups, badges) — polled so awards made
  // during the day join the ticker rotation for the rest of the day.
  const [tickerEvents, setTickerEvents] = useState([]);
  useEffect(() => {
    if (!isAuthenticated) {
      setTickerEvents([]);
      return undefined;
    }
    let alive = true;
    const fetchEvents = async () => {
      try {
        const res = await fetchWithAuth('/api/badges/ticker');
        if (res.ok) {
          const data = await res.json();
          if (alive) setTickerEvents(data.events || []);
        }
      } catch {
        // non-critical — ticker just shows news headlines
      }
    };
    fetchEvents();
    // Idle background tabs (teachers leave Tally open all day) shouldn't keep
    // polling — skip while hidden, catch up as soon as the tab is visible again.
    const id = setInterval(() => {
      if (!document.hidden) fetchEvents();
    }, TICKER_EVENTS_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) fetchEvents();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAuthenticated, fetchWithAuth, activeOrganizationId]);

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
  const activeClasses = classes.filter((cls) => !cls.disabled);

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

  // Sentence-case the stored role ('teacher' → 'Teacher') for display
  const roleLabel = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '';

  // Get display name for current filter
  const getFilterDisplayName = () => {
    if (globalClassFilter === 'all') return 'All Classes';
    if (globalClassFilter === 'unassigned') return 'Unassigned';
    const selectedClass = classes.find((cls) => cls.id === globalClassFilter);
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

          {/* Reading News ticker — rotates headlines + today's celebrations */}
          {isAuthenticated && (
            <Box sx={{ flex: 1, minWidth: 0, mr: 2, display: { xs: 'none', sm: 'block' } }}>
              <ReadingNewsTicker
                data={newsData}
                liveEvents={tickerEvents}
                onOpen={onOpenNews}
                compact
              />
            </Box>
          )}

          {/* Global Class Filter Dropdown */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              mr: { xs: 1, sm: 2 },
              ml: 'auto',
            }}
          >
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
                <MenuItem value="all" sx={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 500 }}>
                  All Classes
                </MenuItem>
                <MenuItem
                  value="unassigned"
                  sx={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 500 }}
                >
                  Unassigned
                </MenuItem>
                {activeClasses.map((cls) => (
                  <MenuItem
                    key={cls.id}
                    value={cls.id}
                    sx={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 500 }}
                  >
                    {formatClassName(cls)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Box>
        {(user?.role === 'owner' || user?.role === 'admin') && (
          <Typography
            variant="caption"
            sx={{
              fontFamily: '"DM Sans", sans-serif',
              fontWeight: 700,
              color: 'primary.dark',
              fontSize: { xs: '0.7rem', sm: '0.75rem' },
              ml: 2,
              backgroundColor: 'rgba(107, 142, 107, 0.15)',
              px: 1.5,
              py: 0.5,
              borderRadius: '6px',
              display: { xs: 'none', sm: 'block' },
            }}
          >
            v{packageJson.version}
          </Typography>
        )}

        {/* Logout Section - only show when authenticated */}
        {isAuthenticated && (
          <Box sx={{ display: 'flex', alignItems: 'center', ml: 'auto', gap: 1 }}>
            {/* School Selector - Only for owners with multiple organizations */}
            {user?.role === 'owner' && availableOrganizations.length > 1 && (
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Chip
                  icon={
                    switchingOrganization ? (
                      <CircularProgress size={14} sx={{ color: 'white' }} />
                    ) : (
                      <SchoolOutlined sx={{ fontSize: 16 }} />
                    )
                  }
                  label={organization?.name || 'Select School'}
                  onClick={handleSchoolMenuClick}
                  aria-label={`Switch school, currently ${organization?.name || 'none selected'}`}
                  aria-haspopup="true"
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
                      selected={
                        activeOrganizationId
                          ? org.id === activeOrganizationId
                          : org.id === organization?.id
                      }
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

            {/* Signed-in identity — lets anyone confirm at a glance whose
                account is in use, on a shared classroom device or otherwise. */}
            {user?.name && (
              <Tooltip
                title={`Signed in as ${user.name}${user.email ? ` (${user.email})` : ''}${
                  roleLabel ? ` · ${roleLabel}` : ''
                }`}
              >
                <Chip
                  icon={<PersonOutlineIcon sx={{ fontSize: 16 }} />}
                  label={user.name}
                  aria-label={`Signed in as ${user.name}${roleLabel ? `, ${roleLabel}` : ''}`}
                  sx={{
                    backgroundColor: 'rgba(107, 142, 107, 0.15)',
                    color: 'primary.dark',
                    fontFamily: '"DM Sans", sans-serif',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    '& .MuiChip-icon': {
                      color: 'primary.dark',
                    },
                    '& .MuiChip-label': {
                      maxWidth: { xs: 90, sm: 160 },
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    },
                  }}
                />
              </Tooltip>
            )}

            <IconButton
              onClick={() => setSupportOpen(true)}
              size="small"
              aria-label="Feedback & help"
              sx={{
                color: 'primary.main',
                '&:hover': { backgroundColor: 'rgba(107, 142, 107, 0.08)' },
              }}
            >
              <HelpOutlineIcon sx={{ fontSize: 20 }} />
            </IconButton>

            <Tooltip title="Logout">
              <IconButton
                onClick={logout}
                size="small"
                aria-label="Logout"
                sx={{
                  color: 'primary.main',
                  border: '1px solid rgba(107, 142, 107, 0.3)',
                  borderRadius: '10px',
                  '&:hover': {
                    borderColor: 'primary.main',
                    backgroundColor: 'rgba(107, 142, 107, 0.05)',
                  },
                }}
              >
                <LogoutIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Toolbar>
      <SupportModal
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        currentPage={currentTab}
      />
    </AppBar>
  );
};

export default Header;
