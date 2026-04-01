import React, { useState, useMemo, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Button,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Skeleton,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AssessmentIcon from '@mui/icons-material/Assessment';
import TimelineIcon from '@mui/icons-material/Timeline';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import DaysSinceReadingChart from './DaysSinceReadingChart';
import ReadingTimelineChart from './ReadingTimelineChart';
import OverviewTab from './OverviewTab';
import NeedsAttentionTab from './NeedsAttentionTab';
import FrequencyTab from './FrequencyTab';
import StreaksTab from './StreaksTab';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';
import { useTour } from '../tour/useTour';
import TourButton from '../tour/TourButton';

const ReadingStats = () => {
  const { fetchWithAuth } = useAuth();
  const { students, classes, exportToJson, reloadDataFromServer } = useData();
  const { globalClassFilter, getReadingStatus } = useUI();
  const [currentTab, setCurrentTab] = useState(0);
  const { tourButtonProps } = useTour('stats');
  const statsTourButtonProps = {
    ...tourButtonProps,
    onClick: () => {
      setCurrentTab(0);
      setTimeout(() => tourButtonProps.onClick(), 100);
    },
  };
  const [recalculating, setRecalculating] = useState(false);
  const [termDates, setTermDates] = useState([]);
  const [selectedTerm, setSelectedTerm] = useState('all');

  useEffect(() => {
    const fetchTermDates = async () => {
      try {
        const res = await fetchWithAuth('/api/term-dates');
        if (res.ok) {
          const data = await res.json();
          setTermDates(data.terms || []);
        }
      } catch {
        // silently fail — no filter shown
      }
    };
    fetchTermDates();
  }, [fetchWithAuth]);

  const termDateRange = useMemo(() => {
    if (selectedTerm === 'all' || termDates.length === 0) return null;
    if (selectedTerm === 'current_term') {
      const today = new Date().toISOString().split('T')[0];
      const current = termDates.find((t) => t.startDate <= today && t.endDate >= today);
      if (!current) return null;
      return { start: current.startDate, end: current.endDate };
    }
    if (selectedTerm === 'school_year') {
      const starts = termDates.map((t) => t.startDate).sort();
      const ends = termDates.map((t) => t.endDate).sort();
      return { start: starts[0], end: ends[ends.length - 1] };
    }
    const term = termDates.find((t) => t.termOrder === selectedTerm);
    if (!term) return null;
    return { start: term.startDate, end: term.endDate };
  }, [selectedTerm, termDates]);

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
  };

  const handleExport = () => {
    exportToJson();
  };

  const handleRecalculateStreaks = async () => {
    setRecalculating(true);
    try {
      const API_URL = '/api';
      const response = await fetchWithAuth(`${API_URL}/students/recalculate-streaks`, {
        method: 'POST',
      });
      if (response.ok) {
        await reloadDataFromServer();
      }
    } catch (error) {
      console.error('Failed to recalculate streaks:', error);
    } finally {
      setRecalculating(false);
    }
  };

  // Shared active students filtered by class — used by stats, session sort, and streaks
  const activeStudents = useMemo(() => {
    return students.filter((student) => {
      if (globalClassFilter && globalClassFilter !== 'all') {
        if (globalClassFilter === 'unassigned') {
          if (student.classId) return false;
        } else {
          if (student.classId !== globalClassFilter) return false;
        }
      }
      if (!student.classId) return true;
      const studentClass = classes.find((cls) => cls.id === student.classId);
      return !studentClass || !studentClass.disabled;
    });
  }, [students, classes, globalClassFilter]);

  // Fetch stats from server
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    setStatsLoading(true);
    const params = new URLSearchParams();
    if (globalClassFilter && globalClassFilter !== 'all') {
      params.set('classId', globalClassFilter);
    }
    if (termDateRange) {
      params.set('startDate', termDateRange.start);
      params.set('endDate', termDateRange.end);
    }
    fetchWithAuth(`/api/students/stats?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setStats(data);
        setStatsLoading(false);
      })
      .catch(() => {
        setStats(null);
        setStatsLoading(false);
      });
  }, [globalClassFilter, termDateRange, fetchWithAuth]);

  // Enrich topStreaks with student names from local data
  const enrichedTopStreaks = useMemo(() => {
    if (!stats?.topStreaks) return [];
    return stats.topStreaks.map((s) => {
      const student = activeStudents.find((st) => st.id === s.id);
      return { ...s, name: student?.name || 'Unknown' };
    });
  }, [stats, activeStudents]);

  // Get students sorted by session count (least to most)
  const getStudentsBySessionCount = () => {
    return [...activeStudents].sort(
      (a, b) => (a.totalSessionCount || 0) - (b.totalSessionCount || 0)
    );
  };

  // Get all students with streak data, sorted by current streak
  const getStudentsWithStreaks = () => {
    return activeStudents
      .map((student) => ({
        ...student,
        currentStreak: student.currentStreak || 0,
        longestStreak: student.longestStreak || 0,
      }))
      .sort((a, b) => {
        // Sort by current streak descending, then by longest streak descending
        if (b.currentStreak !== a.currentStreak) {
          return b.currentStreak - a.currentStreak;
        }
        return b.longestStreak - a.longestStreak;
      });
  };

  // Get students who haven't been read with recently
  const getNeedsAttentionStudents = () => {
    return activeStudents.filter((student) => {
      const status = getReadingStatus(student);
      return status === 'never' || status === 'overdue' || status === 'attention';
    });
  };

  const renderStatsLoading = () => (
    <Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} sx={{ borderRadius: 3 }}>
            <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
              <Skeleton variant="text" width="60%" sx={{ mx: 'auto' }} />
              <Skeleton variant="text" width="40%" height={40} sx={{ mx: 'auto' }} />
            </CardContent>
          </Card>
        ))}
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(280px, 1fr))' },
          gap: 2,
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} sx={{ borderRadius: 3 }}>
            <CardContent sx={{ py: 2 }}>
              <Skeleton variant="text" width="50%" />
              <Skeleton variant="rectangular" height={60} sx={{ mt: 1, borderRadius: 1 }} />
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Typography
          variant="h4"
          component="h1"
          sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: 'text.primary' }}
        >
          Reading Statistics
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {termDates.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="term-filter-label">Period</InputLabel>
              <Select
                labelId="term-filter-label"
                value={selectedTerm}
                label="Period"
                onChange={(e) => setSelectedTerm(e.target.value)}
              >
                <MenuItem value="all">All Time</MenuItem>
                <MenuItem value="current_term">Current Term</MenuItem>
                <MenuItem value="school_year">School Year</MenuItem>
                {termDates.map((term) => (
                  <MenuItem key={term.termOrder} value={term.termOrder}>
                    {term.termName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
            sx={{
              borderRadius: 3,
              fontWeight: 600,
              borderWidth: 2,
              '&:hover': { borderWidth: 2 },
            }}
          >
            Export Data
          </Button>
        </Box>
      </Box>

      <Box>
        <Paper
          data-tour="stats-tabs"
          sx={{
            mb: 3,
            overflow: 'hidden',
            borderRadius: 4,
            backgroundColor: 'background.paper',
          }}
        >
          <Tabs
            value={currentTab}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            indicatorColor="primary"
            textColor="primary"
            aria-label="Statistics tabs"
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
            <Tab icon={<AssessmentIcon />} iconPosition="start" label="Overview" />
            <Tab icon={<WhatshotIcon />} iconPosition="start" label="Streaks" />
            <Tab icon={<CalendarTodayIcon />} iconPosition="start" label="Needs Attention" />
            <Tab icon={<MenuBookIcon />} iconPosition="start" label="Reading Frequency" />
            <Tab icon={<TimelineIcon />} iconPosition="start" label="Reading Timeline" />
          </Tabs>
        </Paper>

        <Box sx={{ p: 0 }}>
          {currentTab === 0 &&
            (students.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
                <Typography variant="body1" color="text.secondary">
                  No data available yet. Add students and record reading sessions to see statistics.
                </Typography>
              </Paper>
            ) : statsLoading || !stats ? (
              renderStatsLoading()
            ) : (
              <OverviewTab stats={stats} enrichedTopStreaks={enrichedTopStreaks} />
            ))}
          {currentTab === 1 &&
            (students.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
                <Typography variant="body1" color="text.secondary">
                  No data available yet. Add students and record reading sessions to see statistics.
                </Typography>
              </Paper>
            ) : statsLoading || !stats ? (
              renderStatsLoading()
            ) : (
              <StreaksTab stats={stats} studentsWithStreaks={getStudentsWithStreaks()} recalculating={recalculating} onRecalculate={handleRecalculateStreaks} />
            ))}
          {currentTab === 2 &&
            (students.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
                <Typography variant="body1" color="text.secondary">
                  No data available yet. Add students and record reading sessions to see statistics.
                </Typography>
              </Paper>
            ) : (
              <NeedsAttentionTab students={getNeedsAttentionStudents()} />
            ))}
          {currentTab === 3 &&
            (students.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
                <Typography variant="body1" color="text.secondary">
                  No data available yet. Add students and record reading sessions to see statistics.
                </Typography>
              </Paper>
            ) : (
              <FrequencyTab students={getStudentsBySessionCount()} />
            ))}
          {currentTab === 4 &&
            (students.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
                <Typography variant="body1" color="text.secondary">
                  No data available yet. Add students and record reading sessions to see statistics.
                </Typography>
              </Paper>
            ) : (
              <Box>
                <DaysSinceReadingChart />
                <Box sx={{ mt: 4 }}>
                  <ReadingTimelineChart />
                </Box>
              </Box>
            ))}
        </Box>
      </Box>
      <TourButton {...statsTourButtonProps} />
    </Box>
  );
};

export default ReadingStats;
