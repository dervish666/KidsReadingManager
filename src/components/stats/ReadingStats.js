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
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Skeleton
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import PersonIcon from '@mui/icons-material/Person';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AssessmentIcon from '@mui/icons-material/Assessment';
import TimelineIcon from '@mui/icons-material/Timeline';
import HomeIcon from '@mui/icons-material/Home';
import SchoolIcon from '@mui/icons-material/School';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import DaysSinceReadingChart from './DaysSinceReadingChart';
import StreakBadge from '../students/StreakBadge';
import ReadingTimelineChart from './ReadingTimelineChart';
import ReadingFrequencyChart from './ReadingFrequencyChart';
import { useAppContext } from '../../contexts/AppContext';

const ReadingStats = () => {
  const { students, classes, exportToJson, getReadingStatus, globalClassFilter, fetchWithAuth, reloadDataFromServer } = useAppContext();
  const [currentTab, setCurrentTab] = useState(0);
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
      const current = termDates.find(t => t.startDate <= today && t.endDate >= today);
      if (!current) return null;
      return { start: current.startDate, end: current.endDate };
    }
    if (selectedTerm === 'school_year') {
      const starts = termDates.map(t => t.startDate).sort();
      const ends = termDates.map(t => t.endDate).sort();
      return { start: starts[0], end: ends[ends.length - 1] };
    }
    const term = termDates.find(t => t.termOrder === selectedTerm);
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
        method: 'POST'
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
    return students.filter(student => {
      if (globalClassFilter && globalClassFilter !== 'all') {
        if (globalClassFilter === 'unassigned') {
          if (student.classId) return false;
        } else {
          if (student.classId !== globalClassFilter) return false;
        }
      }
      if (!student.classId) return true;
      const studentClass = classes.find(cls => cls.id === student.classId);
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
      .then(r => r.ok ? r.json() : null)
      .then(data => {
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
    return stats.topStreaks.map(s => {
      const student = activeStudents.find(st => st.id === s.id);
      return { ...s, name: student?.name || 'Unknown' };
    });
  }, [stats, activeStudents]);
  
  // Get students sorted by session count (least to most)
  const getStudentsBySessionCount = () => {
    return [...activeStudents].sort((a, b) =>
      (a.totalSessionCount || 0) - (b.totalSessionCount || 0)
    );
  };
  
  // Get all students with streak data, sorted by current streak
  const getStudentsWithStreaks = () => {
    return activeStudents
      .map(student => ({
        ...student,
        currentStreak: student.currentStreak || 0,
        longestStreak: student.longestStreak || 0
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
    return activeStudents.filter(student => getReadingStatus(student) === 'notRead');
  };
  
  const renderStatsLoading = () => (
    <Box>
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
        gap: 2,
        mb: 3
      }}>
        {[1, 2, 3, 4].map(i => (
          <Card key={i} sx={{ borderRadius: 3 }}>
            <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
              <Skeleton variant="text" width="60%" sx={{ mx: 'auto' }} />
              <Skeleton variant="text" width="40%" height={40} sx={{ mx: 'auto' }} />
            </CardContent>
          </Card>
        ))}
      </Box>
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(280px, 1fr))' },
        gap: 2
      }}>
        {[1, 2, 3, 4].map(i => (
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

  const renderOverviewTab = () => (
    <Box>
      {/* Summary stats - responsive grid */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
        gap: 2,
        mb: 3
      }}>
        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Students
            </Typography>
            <Typography variant="h4" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#6B8E6B' }}>
              {stats.totalStudents}
            </Typography>
          </CardContent>
        </Card>

        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Sessions
            </Typography>
            <Typography variant="h4" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#8B7355' }}>
              {stats.totalSessions}
            </Typography>
          </CardContent>
        </Card>

        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Avg/Student
            </Typography>
            <Typography variant="h4" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#0EA5E9' }}>
              {stats.averageSessionsPerStudent.toFixed(1)}
            </Typography>
          </CardContent>
        </Card>

        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Never Read
            </Typography>
            <Typography variant="h4" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#F59E0B' }}>
              {stats.studentsWithNoSessions}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Main content grid - auto-fill columns */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: '1fr',
          sm: 'repeat(auto-fit, minmax(280px, 1fr))'
        },
        gap: 2
      }}>
        {/* This Week's Activity */}
        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ py: 2 }}>
            <Typography variant="subtitle2" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}>
              This Week's Activity
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#6B8E6B' }}>
                  {stats.weeklyActivity.thisWeek}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  This Week
                </Typography>
              </Box>
              {stats.weeklyActivity.thisWeek >= stats.weeklyActivity.lastWeek ? (
                <TrendingUpIcon sx={{ fontSize: 28, color: '#10B981' }} />
              ) : (
                <TrendingDownIcon sx={{ fontSize: 28, color: '#EF4444' }} />
              )}
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h4" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#9CA3AF' }}>
                  {stats.weeklyActivity.lastWeek}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Last Week
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Home vs School Reading */}
        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ py: 2 }}>
            <Typography variant="subtitle2" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}>
              Home vs School
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-around' }}>
              <Box sx={{ textAlign: 'center', p: 1, borderRadius: 2, bgcolor: '#DBEAFE', minWidth: 80 }}>
                <SchoolIcon sx={{ fontSize: 20, color: '#3B82F6' }} />
                <Typography variant="h5" sx={{ color: '#3B82F6', fontWeight: 800, fontFamily: '"Nunito", sans-serif' }}>
                  {stats.locationDistribution.school}
                </Typography>
                <Typography variant="caption" sx={{ color: '#1D4ED8', fontWeight: 600 }}>
                  School
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'center', p: 1, borderRadius: 2, bgcolor: '#FCE7F3', minWidth: 80 }}>
                <HomeIcon sx={{ fontSize: 20, color: '#EC4899' }} />
                <Typography variant="h5" sx={{ color: '#EC4899', fontWeight: 800, fontFamily: '"Nunito", sans-serif' }}>
                  {stats.locationDistribution.home}
                </Typography>
                <Typography variant="caption" sx={{ color: '#BE185D', fontWeight: 600 }}>
                  Home
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Reading by Day of Week */}
        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ py: 2 }}>
            <Typography variant="subtitle2" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}>
              Reading by Day
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 0.25 }}>
              {Object.entries(stats.readingByDay).map(([day, count]) => {
                const maxCount = Math.max(...Object.values(stats.readingByDay), 1);
                const height = Math.max((count / maxCount) * 40, 3);
                return (
                  <Box key={day} sx={{ textAlign: 'center', flex: 1 }}>
                    <Box sx={{ height: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', mb: 0.25 }}>
                      <Box sx={{
                        width: '80%',
                        maxWidth: 20,
                        height: height,
                        bgcolor: count > 0 ? '#6B8E6B' : '#E5E7EB',
                        borderRadius: 0.5
                      }} />
                    </Box>
                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: '#7A7A7A' }}>
                      {day.slice(0, 2)}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </CardContent>
        </Card>

        {/* Reading Streaks Summary */}
        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ py: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              <WhatshotIcon sx={{ color: '#FF6B35', fontSize: 20 }} />
              <Typography variant="subtitle2" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}>
                Streaks
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-around' }}>
              <Box sx={{ textAlign: 'center', p: 1, borderRadius: 2, bgcolor: 'rgba(255, 107, 53, 0.1)' }}>
                <Typography variant="h5" sx={{ color: '#FF6B35', fontWeight: 800, fontFamily: '"Nunito", sans-serif' }}>
                  {stats.studentsWithActiveStreak}
                </Typography>
                <Typography sx={{ color: '#C2410C', fontWeight: 600, fontSize: '0.65rem' }}>
                  Active
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'center', p: 1, borderRadius: 2, bgcolor: 'rgba(255, 215, 0, 0.15)' }}>
                <Typography variant="h5" sx={{ color: '#B8860B', fontWeight: 800, fontFamily: '"Nunito", sans-serif' }}>
                  {stats.longestCurrentStreak}
                </Typography>
                <Typography sx={{ color: '#92400E', fontWeight: 600, fontSize: '0.65rem' }}>
                  Best
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'center', p: 1, borderRadius: 2, bgcolor: 'rgba(107, 142, 107, 0.1)' }}>
                <Typography variant="h5" sx={{ color: '#6B8E6B', fontWeight: 800, fontFamily: '"Nunito", sans-serif' }}>
                  {stats.averageStreak.toFixed(1)}
                </Typography>
                <Typography sx={{ color: '#5B21B6', fontWeight: 600, fontSize: '0.65rem' }}>
                  Avg
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Most Read Books */}
        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ py: 2 }}>
            <Typography variant="subtitle2" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}>
              Most Read Books
            </Typography>
            {stats.mostReadBooks.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                No book data yet
              </Typography>
            ) : (
              <Box>
                {stats.mostReadBooks.slice(0, 4).map((book, index) => (
                  <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                    <Box sx={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      bgcolor: index === 0 ? '#FEF3C7' : '#F3F4F6',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: index === 0 ? '#F59E0B' : '#6B7280' }}>
                        {index + 1}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                      {book.title}
                    </Typography>
                    <Chip label={book.count} size="small" sx={{ height: 20, fontSize: '0.65rem', bgcolor: '#E0E7FF', color: '#4F46E5' }} />
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Streak Leaderboard */}
        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ py: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              <EmojiEventsIcon sx={{ color: '#FFD700', fontSize: 20 }} />
              <Typography variant="subtitle2" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}>
                Streak Leaders
              </Typography>
            </Box>
            {enrichedTopStreaks.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                No active streaks
              </Typography>
            ) : (
              <Box>
                {enrichedTopStreaks.slice(0, 4).map((student, index) => (
                  <Box key={student.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                    <Box sx={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      bgcolor: index === 0 ? '#FEF3C7' : index === 1 ? '#F3F4F6' : index === 2 ? '#FED7AA' : '#F3F4F6',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: index === 0 ? '#F59E0B' : index === 1 ? '#6B7280' : index === 2 ? '#EA580C' : '#6B7280' }}>
                        {index + 1}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                      {student.name}
                    </Typography>
                    <StreakBadge streak={student.currentStreak} size="small" />
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
  
  const renderNeedsAttentionTab = () => {
    const needsAttentionStudents = getNeedsAttentionStudents();
    
    return (
      <Box>
        <Typography variant="h6" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}>
          Students Needing Attention
        </Typography>
        
        {needsAttentionStudents.length === 0 ? (
          <Alert severity="success" sx={{ mt: 2, borderRadius: 4 }}>
            Great job! All students have been read with recently.
          </Alert>
        ) : (
          <Paper sx={{ borderRadius: 4, overflow: 'hidden' }}>
            <List>
              {needsAttentionStudents.map(student => (
                <ListItem key={student.id} divider>
                  <ListItemIcon>
                    <Box sx={{ 
                      width: 40, 
                      height: 40, 
                      borderRadius: '50%', 
                      bgcolor: '#FEE2E2', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center' 
                    }}>
                      <PersonIcon sx={{ color: '#EF4444' }} />
                    </Box>
                  </ListItemIcon>
                  <ListItemText
                    primary={<Typography sx={{ fontWeight: 600, fontFamily: '"DM Sans", sans-serif' }}>{student.name}</Typography>}
                    secondary={`Last read: ${student.lastReadDate 
                      ? new Date(student.lastReadDate).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        }) 
                      : 'Never'}`}
                  />
                  <Chip 
                    label="Needs Reading" 
                    sx={{ 
                      bgcolor: '#FEE2E2', 
                      color: '#EF4444', 
                      fontWeight: 700,
                      borderRadius: 2
                    }}
                    size="small" 
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        )}
      </Box>
    );
  };
  
  const renderFrequencyTab = () => {
    const sortedStudents = getStudentsBySessionCount();
    
    return (
      <Box>
        {/* Bar Chart Visualization */}
        <ReadingFrequencyChart />
        
        {/* List View */}
        <Typography variant="h6" gutterBottom sx={{ mt: 4, fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}>
          Reading Frequency Details
        </Typography>
        
        <Paper sx={{ borderRadius: 4, overflow: 'hidden' }}>
          <List>
            {sortedStudents.map(student => {
              const sessionCount = student.totalSessionCount || 0;
              return (
              <ListItem key={student.id} divider>
                <ListItemIcon>
                  <Box sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    bgcolor: '#E0E7FF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <PersonIcon sx={{ color: '#4F46E5' }} />
                  </Box>
                </ListItemIcon>
                <ListItemText
                  primary={<Typography sx={{ fontWeight: 600, fontFamily: '"DM Sans", sans-serif' }}>{student.name}</Typography>}
                  secondary={`Last read: ${student.lastReadDate
                    ? new Date(student.lastReadDate).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })
                    : 'Never'}`}
                />
                <Chip
                  label={`${sessionCount} sessions`}
                  sx={{
                    bgcolor: sessionCount === 0 ? '#FEE2E2' : '#E0E7FF',
                    color: sessionCount === 0 ? '#EF4444' : '#4F46E5',
                    fontWeight: 700,
                    borderRadius: 2
                  }}
                  size="small"
                />
              </ListItem>
              );
            })}
          </List>
        </Paper>
      </Box>
    );
  };

  const renderStreaksTab = () => {
    const studentsWithStreaks = getStudentsWithStreaks();
    const studentsWithActiveStreaks = studentsWithStreaks.filter(s => s.currentStreak > 0);
    const studentsWithNoStreak = studentsWithStreaks.filter(s => s.currentStreak === 0);

    return (
      <Box>
        {/* Update Streaks Button */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={recalculating ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={handleRecalculateStreaks}
            disabled={recalculating}
            sx={{
              borderRadius: 3,
              fontWeight: 600,
              borderWidth: 2,
              borderColor: '#FF6B35',
              color: '#FF6B35',
              '&:hover': { borderWidth: 2, borderColor: '#E55A2B', bgcolor: 'rgba(255, 107, 53, 0.04)' }
            }}
          >
            {recalculating ? 'Updating...' : 'Update Streaks'}
          </Button>
        </Box>

        {/* Streak Summary Cards - responsive row */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
          <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
            <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
              <WhatshotIcon sx={{ fontSize: 24, color: '#FF6B35' }} />
              <Typography variant="h4" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#FF6B35' }}>
                {stats.studentsWithActiveStreak}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Active
              </Typography>
            </CardContent>
          </Card>

          <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
            <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
              <EmojiEventsIcon sx={{ fontSize: 24, color: '#FFD700' }} />
              <Typography variant="h4" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#B8860B' }}>
                {stats.longestCurrentStreak}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Best Current
              </Typography>
            </CardContent>
          </Card>

          <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
            <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
              <Box sx={{ fontSize: 24 }}>🏆</Box>
              <Typography variant="h4" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#6B8E6B' }}>
                {stats.longestEverStreak}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                All-Time
              </Typography>
            </CardContent>
          </Card>

          <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
            <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
              <Box sx={{ fontSize: 24 }}>📊</Box>
              <Typography variant="h4" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#0EA5E9' }}>
                {stats.averageStreak.toFixed(1)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Average
              </Typography>
            </CardContent>
          </Card>
        </Box>

        {/* Two-column layout for lists */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          {/* Active Streaks List */}
          <Box>
            <Typography variant="subtitle1" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <WhatshotIcon sx={{ color: '#FF6B35', fontSize: 20 }} />
              Active Streaks ({studentsWithActiveStreaks.length})
            </Typography>

            {studentsWithActiveStreaks.length === 0 ? (
              <Alert severity="info" sx={{ borderRadius: 3 }}>
                No active streaks yet
              </Alert>
            ) : (
              <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
                {studentsWithActiveStreaks.map((student, index) => (
                  <Box key={student.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      bgcolor: index === 0 ? '#FEF3C7' : index === 1 ? '#F3F4F6' : index === 2 ? '#FED7AA' : 'rgba(255, 107, 53, 0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: index === 0 ? '#F59E0B' : index === 1 ? '#6B7280' : index === 2 ? '#EA580C' : '#FF6B35' }}>
                        {index + 1}
                      </Typography>
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {student.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Best: {student.longestStreak}d
                      </Typography>
                    </Box>
                    <StreakBadge streak={student.currentStreak} size="small" />
                  </Box>
                ))}
              </Paper>
            )}
          </Box>

          {/* Students Without Streaks */}
          <Box>
            <Typography variant="subtitle1" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PersonIcon sx={{ color: '#9CA3AF', fontSize: 20 }} />
              No Streak ({studentsWithNoStreak.length})
            </Typography>

            {studentsWithNoStreak.length === 0 ? (
              <Alert severity="success" sx={{ borderRadius: 3 }}>
                All students have streaks!
              </Alert>
            ) : (
              <Paper sx={{ borderRadius: 3, overflow: 'hidden', maxHeight: 300, overflowY: 'auto' }}>
                {studentsWithNoStreak.map(student => (
                  <Box key={student.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      bgcolor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <PersonIcon sx={{ color: '#9CA3AF', fontSize: 14 }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {student.name}
                      </Typography>
                      {student.longestStreak > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Previous: {student.longestStreak}d
                        </Typography>
                      )}
                    </Box>
                  </Box>
                ))}
              </Paper>
            )}
          </Box>
        </Box>
      </Box>
    );
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h4" component="h1" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#4A4A4A' }}>
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
                {termDates.map(term => (
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
              '&:hover': { borderWidth: 2 }
            }}
          >
            Export Data
          </Button>
        </Box>
      </Box>
      
      <Box>
        <Paper sx={{ 
          mb: 3, 
          overflow: 'hidden', 
          borderRadius: 4, 
          backgroundColor: '#FFFEF9'
        }}>
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
                minHeight: 64
              }
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
          {currentTab === 0 && (
            students.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
                <Typography variant="body1" color="text.secondary">
                  No data available yet. Add students and record reading sessions to see statistics.
                </Typography>
              </Paper>
            ) : (statsLoading || !stats) ? renderStatsLoading() : renderOverviewTab()
          )}
          {currentTab === 1 && (
            students.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
                <Typography variant="body1" color="text.secondary">
                  No data available yet. Add students and record reading sessions to see statistics.
                </Typography>
              </Paper>
            ) : (statsLoading || !stats) ? renderStatsLoading() : renderStreaksTab()
          )}
          {currentTab === 2 && (
            students.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
                <Typography variant="body1" color="text.secondary">
                  No data available yet. Add students and record reading sessions to see statistics.
                </Typography>
              </Paper>
            ) : renderNeedsAttentionTab()
          )}
          {currentTab === 3 && (
            students.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
                <Typography variant="body1" color="text.secondary">
                  No data available yet. Add students and record reading sessions to see statistics.
                </Typography>
              </Paper>
            ) : renderFrequencyTab()
          )}
          {currentTab === 4 && (
            students.length === 0 ? (
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
            )
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default ReadingStats;