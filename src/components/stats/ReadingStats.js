import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
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
  Alert
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
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
  const { students, classes, exportToJson, getReadingStatus, globalClassFilter } = useAppContext();
  const [currentTab, setCurrentTab] = useState(0);
  
  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
  };
  
  const handleExport = () => {
    exportToJson();
  };
  
  // Calculate statistics
  const calculateStats = () => {
    // Filter students based on global class filter and disabled classes
    const activeStudents = students.filter(student => {
      // First, filter by global class filter
      if (globalClassFilter && globalClassFilter !== 'all') {
        if (globalClassFilter === 'unassigned') {
          if (student.classId) return false;
        } else {
          if (student.classId !== globalClassFilter) return false;
        }
      }

      // Then, filter out students from disabled classes
      if (!student.classId) return true; // Include students not assigned to any class
      const studentClass = classes.find(cls => cls.id === student.classId);
      return !studentClass || !studentClass.disabled;
    });

    // Calculate date boundaries
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    if (activeStudents.length === 0) {
      return {
        totalStudents: 0,
        totalSessions: 0,
        averageSessionsPerStudent: 0,
        studentsWithNoSessions: 0,
        statusDistribution: { notRead: 0, needsAttention: 0, recentlyRead: 0 },
        locationDistribution: { home: 0, school: 0 },
        weeklyActivity: { thisWeek: 0, lastWeek: 0 },
        mostReadBooks: [],
        readingByDay: { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 },
        // Streak stats
        studentsWithActiveStreak: 0,
        totalActiveStreakDays: 0,
        longestCurrentStreak: 0,
        longestEverStreak: 0,
        averageStreak: 0,
        topStreaks: []
      };
    }

    let totalSessions = 0;
    let studentsWithNoSessions = 0;
    let statusCounts = { notRead: 0, needsAttention: 0, recentlyRead: 0 };
    let locationCounts = { home: 0, school: 0 };
    let thisWeekSessions = 0;
    let lastWeekSessions = 0;
    const bookCounts = {};
    const dayCounts = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Streak tracking
    let studentsWithActiveStreak = 0;
    let totalActiveStreakDays = 0;
    let longestCurrentStreak = 0;
    let longestEverStreak = 0;
    const streakData = [];

    // Count sessions and new stats
    activeStudents.forEach(student => {
      const sessionCount = student.readingSessions?.length || 0;
      totalSessions += sessionCount;

      if (sessionCount === 0) {
        studentsWithNoSessions++;
      }

      // Process each session for detailed stats
      (student.readingSessions || []).forEach(session => {
        // Location distribution
        const location = session.location || 'school';
        if (locationCounts.hasOwnProperty(location)) {
          locationCounts[location]++;
        }

        // Weekly activity
        if (session.date) {
          const sessionDate = new Date(session.date);
          if (sessionDate >= startOfWeek) {
            thisWeekSessions++;
          } else if (sessionDate >= startOfLastWeek && sessionDate < startOfWeek) {
            lastWeekSessions++;
          }

          // Reading by day of week
          const dayOfWeek = sessionDate.getDay();
          dayCounts[dayNames[dayOfWeek]]++;
        }

        // Most read books
        if (session.bookTitle) {
          const bookKey = session.bookTitle;
          bookCounts[bookKey] = (bookCounts[bookKey] || 0) + 1;
        }
      });

      // Count reading status
      const status = getReadingStatus(student);
      statusCounts[status]++;

      // Streak tracking
      const currentStreak = student.currentStreak || 0;
      const longestStreak = student.longestStreak || 0;

      if (currentStreak > 0) {
        studentsWithActiveStreak++;
        totalActiveStreakDays += currentStreak;
        if (currentStreak > longestCurrentStreak) {
          longestCurrentStreak = currentStreak;
        }
      }

      if (longestStreak > longestEverStreak) {
        longestEverStreak = longestStreak;
      }

      // Collect streak data for leaderboard
      if (currentStreak > 0 || longestStreak > 0) {
        streakData.push({
          id: student.id,
          name: student.name,
          currentStreak,
          longestStreak,
          streakStartDate: student.streakStartDate
        });
      }
    });

    // Get top 5 most read books
    const mostReadBooks = Object.entries(bookCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([title, count]) => ({ title, count }));

    // Get top streaks (sorted by current streak, then longest streak)
    const topStreaks = streakData
      .sort((a, b) => {
        if (b.currentStreak !== a.currentStreak) {
          return b.currentStreak - a.currentStreak;
        }
        return b.longestStreak - a.longestStreak;
      })
      .slice(0, 5);

    // Calculate average streak for students with active streaks
    const averageStreak = studentsWithActiveStreak > 0
      ? totalActiveStreakDays / studentsWithActiveStreak
      : 0;

    return {
      totalStudents: activeStudents.length,
      totalSessions,
      averageSessionsPerStudent: activeStudents.length > 0 ? totalSessions / activeStudents.length : 0,
      studentsWithNoSessions,
      statusDistribution: statusCounts,
      locationDistribution: locationCounts,
      weeklyActivity: { thisWeek: thisWeekSessions, lastWeek: lastWeekSessions },
      mostReadBooks,
      readingByDay: dayCounts,
      // Streak stats
      studentsWithActiveStreak,
      totalActiveStreakDays,
      longestCurrentStreak,
      longestEverStreak,
      averageStreak,
      topStreaks
    };
  };
  
  const stats = calculateStats();
  
  // Get students sorted by session count (least to most)
  const getStudentsBySessionCount = () => {
    const activeStudents = students.filter(student => {
      // First, filter by global class filter
      if (globalClassFilter && globalClassFilter !== 'all') {
        if (globalClassFilter === 'unassigned') {
          if (student.classId) return false;
        } else {
          if (student.classId !== globalClassFilter) return false;
        }
      }
      
      // Then, filter out students from disabled classes
      if (!student.classId) return true;
      const studentClass = classes.find(cls => cls.id === student.classId);
      return !studentClass || !studentClass.disabled;
    });
    return [...activeStudents].sort((a, b) =>
      a.readingSessions.length - b.readingSessions.length
    );
  };
  
  // Get all students with streak data, sorted by current streak
  const getStudentsWithStreaks = () => {
    const activeStudents = students.filter(student => {
      // First, filter by global class filter
      if (globalClassFilter && globalClassFilter !== 'all') {
        if (globalClassFilter === 'unassigned') {
          if (student.classId) return false;
        } else {
          if (student.classId !== globalClassFilter) return false;
        }
      }

      // Then, filter out students from disabled classes
      if (!student.classId) return true;
      const studentClass = classes.find(cls => cls.id === student.classId);
      return !studentClass || !studentClass.disabled;
    });

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
    const activeStudents = students.filter(student => {
      // First, filter by global class filter
      if (globalClassFilter && globalClassFilter !== 'all') {
        if (globalClassFilter === 'unassigned') {
          if (student.classId) return false;
        } else {
          if (student.classId !== globalClassFilter) return false;
        }
      }
      
      // Then, filter out students from disabled classes
      if (!student.classId) return true;
      const studentClass = classes.find(cls => cls.id === student.classId);
      return !studentClass || !studentClass.disabled;
    });
    return activeStudents.filter(student => getReadingStatus(student) === 'notRead');
  };
  
  const renderOverviewTab = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} sm={6} md={3}>
        <Card sx={{ height: '100%', borderRadius: 4, boxShadow: '8px 8px 16px rgba(160, 150, 180, 0.1)' }}>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary" gutterBottom sx={{ fontWeight: 600 }}>
              Total Students
            </Typography>
            <Typography variant="h3" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#7C3AED' }}>
              {stats.totalStudents}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      
      <Grid item xs={12} sm={6} md={3}>
        <Card sx={{ height: '100%', borderRadius: 4, boxShadow: '8px 8px 16px rgba(160, 150, 180, 0.1)' }}>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary" gutterBottom sx={{ fontWeight: 600 }}>
              Total Reading Sessions
            </Typography>
            <Typography variant="h3" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#DB2777' }}>
              {stats.totalSessions}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      
      <Grid item xs={12} sm={6} md={3}>
        <Card sx={{ height: '100%', borderRadius: 4, boxShadow: '8px 8px 16px rgba(160, 150, 180, 0.1)' }}>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary" gutterBottom sx={{ fontWeight: 600 }}>
              Avg. Sessions per Student
            </Typography>
            <Typography variant="h3" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#0EA5E9' }}>
              {stats.averageSessionsPerStudent.toFixed(1)}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      
      <Grid item xs={12} sm={6} md={3}>
        <Card sx={{ height: '100%', borderRadius: 4, boxShadow: '8px 8px 16px rgba(160, 150, 180, 0.1)' }}>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary" gutterBottom sx={{ fontWeight: 600 }}>
              Students Never Read With
            </Typography>
            <Typography variant="h3" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#F59E0B' }}>
              {stats.studentsWithNoSessions}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      
      {/* This Week's Activity */}
      <Grid item xs={12} sm={6}>
        <Card sx={{ borderRadius: 4, boxShadow: '8px 8px 16px rgba(160, 150, 180, 0.1)' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}>
              This Week's Activity
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', mt: 2 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h3" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#7C3AED' }}>
                  {stats.weeklyActivity.thisWeek}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  This Week
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', px: 2 }}>
                {stats.weeklyActivity.thisWeek >= stats.weeklyActivity.lastWeek ? (
                  <TrendingUpIcon sx={{ fontSize: 40, color: '#10B981' }} />
                ) : (
                  <TrendingDownIcon sx={{ fontSize: 40, color: '#EF4444' }} />
                )}
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h3" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#9CA3AF' }}>
                  {stats.weeklyActivity.lastWeek}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Last Week
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Home vs School Reading */}
      <Grid item xs={12} sm={6}>
        <Card sx={{ borderRadius: 4, boxShadow: '8px 8px 16px rgba(160, 150, 180, 0.1)' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}>
              Home vs School Reading
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-around', mt: 2 }}>
              <Box sx={{ textAlign: 'center', p: 2, borderRadius: 3, bgcolor: '#DBEAFE', minWidth: 120 }}>
                <SchoolIcon sx={{ fontSize: 32, color: '#3B82F6', mb: 1 }} />
                <Typography variant="h4" sx={{ color: '#3B82F6', fontWeight: 800, fontFamily: '"Nunito", sans-serif' }}>
                  {stats.locationDistribution.school}
                </Typography>
                <Typography variant="body2" sx={{ color: '#1D4ED8', fontWeight: 600 }}>
                  School
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'center', p: 2, borderRadius: 3, bgcolor: '#FCE7F3', minWidth: 120 }}>
                <HomeIcon sx={{ fontSize: 32, color: '#EC4899', mb: 1 }} />
                <Typography variant="h4" sx={{ color: '#EC4899', fontWeight: 800, fontFamily: '"Nunito", sans-serif' }}>
                  {stats.locationDistribution.home}
                </Typography>
                <Typography variant="body2" sx={{ color: '#BE185D', fontWeight: 600 }}>
                  Home
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Reading by Day of Week */}
      <Grid item xs={12} sm={6}>
        <Card sx={{ borderRadius: 4, boxShadow: '8px 8px 16px rgba(160, 150, 180, 0.1)' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}>
              Reading by Day
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2, gap: 0.5 }}>
              {Object.entries(stats.readingByDay).map(([day, count]) => {
                const maxCount = Math.max(...Object.values(stats.readingByDay), 1);
                const height = Math.max((count / maxCount) * 60, 4);
                return (
                  <Box key={day} sx={{ textAlign: 'center', flex: 1 }}>
                    <Box sx={{
                      height: 70,
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'center',
                      mb: 0.5
                    }}>
                      <Box sx={{
                        width: '100%',
                        maxWidth: 30,
                        height: height,
                        bgcolor: count > 0 ? '#7C3AED' : '#E5E7EB',
                        borderRadius: 1,
                        transition: 'height 0.3s'
                      }} />
                    </Box>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: '#635F69' }}>
                      {day}
                    </Typography>
                    <Typography variant="caption" display="block" sx={{ color: '#9CA3AF', fontSize: '0.65rem' }}>
                      {count}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Most Read Books */}
      <Grid item xs={12} sm={6}>
        <Card sx={{ borderRadius: 4, boxShadow: '8px 8px 16px rgba(160, 150, 180, 0.1)' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}>
              Most Read Books
            </Typography>
            {stats.mostReadBooks.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
                No book data recorded yet
              </Typography>
            ) : (
              <List dense sx={{ mt: 1 }}>
                {stats.mostReadBooks.map((book, index) => (
                  <ListItem key={index} sx={{ px: 0 }}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Box sx={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        bgcolor: index === 0 ? '#FEF3C7' : '#F3F4F6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: index === 0 ? '#F59E0B' : '#6B7280' }}>
                          {index + 1}
                        </Typography>
                      </Box>
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {book.title}
                        </Typography>
                      }
                    />
                    <Chip
                      label={`${book.count} ${book.count === 1 ? 'read' : 'reads'}`}
                      size="small"
                      sx={{
                        bgcolor: '#E0E7FF',
                        color: '#4F46E5',
                        fontWeight: 600,
                        fontSize: '0.7rem'
                      }}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      </Grid>

      {/* Reading Streaks Summary */}
      <Grid item xs={12} sm={6}>
        <Card sx={{ borderRadius: 4, boxShadow: '8px 8px 16px rgba(160, 150, 180, 0.1)' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <WhatshotIcon sx={{ color: '#FF6B35' }} />
              <Typography variant="h6" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}>
                Reading Streaks
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-around', mb: 2 }}>
              <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 3, bgcolor: 'rgba(255, 107, 53, 0.1)', minWidth: 100 }}>
                <Typography variant="h4" sx={{ color: '#FF6B35', fontWeight: 800, fontFamily: '"Nunito", sans-serif' }}>
                  {stats.studentsWithActiveStreak}
                </Typography>
                <Typography variant="body2" sx={{ color: '#C2410C', fontWeight: 600, fontSize: '0.75rem' }}>
                  Active Streaks
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 3, bgcolor: 'rgba(255, 215, 0, 0.15)', minWidth: 100 }}>
                <Typography variant="h4" sx={{ color: '#B8860B', fontWeight: 800, fontFamily: '"Nunito", sans-serif' }}>
                  {stats.longestCurrentStreak}
                </Typography>
                <Typography variant="body2" sx={{ color: '#92400E', fontWeight: 600, fontSize: '0.75rem' }}>
                  Best Current
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 3, bgcolor: 'rgba(124, 58, 237, 0.1)', minWidth: 100 }}>
                <Typography variant="h4" sx={{ color: '#7C3AED', fontWeight: 800, fontFamily: '"Nunito", sans-serif' }}>
                  {stats.averageStreak.toFixed(1)}
                </Typography>
                <Typography variant="body2" sx={{ color: '#5B21B6', fontWeight: 600, fontSize: '0.75rem' }}>
                  Avg Streak
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Streak Leaderboard */}
      <Grid item xs={12} sm={6}>
        <Card sx={{ borderRadius: 4, boxShadow: '8px 8px 16px rgba(160, 150, 180, 0.1)' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <EmojiEventsIcon sx={{ color: '#FFD700' }} />
              <Typography variant="h6" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}>
                Streak Leaderboard
              </Typography>
            </Box>
            {stats.topStreaks.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
                No active streaks yet
              </Typography>
            ) : (
              <List dense sx={{ mt: 1 }}>
                {stats.topStreaks.map((student, index) => (
                  <ListItem key={student.id} sx={{ px: 0 }}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Box sx={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        bgcolor: index === 0 ? '#FEF3C7' : index === 1 ? '#F3F4F6' : index === 2 ? '#FED7AA' : '#F3F4F6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Typography variant="caption" sx={{
                          fontWeight: 700,
                          color: index === 0 ? '#F59E0B' : index === 1 ? '#6B7280' : index === 2 ? '#EA580C' : '#6B7280'
                        }}>
                          {index + 1}
                        </Typography>
                      </Box>
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {student.name}
                        </Typography>
                      }
                    />
                    <StreakBadge streak={student.currentStreak} size="small" />
                  </ListItem>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
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
            {sortedStudents.map(student => (
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
                  label={`${student.readingSessions.length} sessions`}
                  sx={{ 
                    bgcolor: student.readingSessions.length === 0 ? '#FEE2E2' : '#E0E7FF', 
                    color: student.readingSessions.length === 0 ? '#EF4444' : '#4F46E5',
                    fontWeight: 700,
                    borderRadius: 2
                  }}
                  size="small"
                />
              </ListItem>
            ))}
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
        {/* Streak Summary Cards */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={6} sm={3}>
            <Card sx={{ borderRadius: 4, boxShadow: '8px 8px 16px rgba(160, 150, 180, 0.1)' }}>
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <WhatshotIcon sx={{ fontSize: 40, color: '#FF6B35', mb: 1 }} />
                <Typography variant="h3" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#FF6B35' }}>
                  {stats.studentsWithActiveStreak}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Active Streaks
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={3}>
            <Card sx={{ borderRadius: 4, boxShadow: '8px 8px 16px rgba(160, 150, 180, 0.1)' }}>
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <EmojiEventsIcon sx={{ fontSize: 40, color: '#FFD700', mb: 1 }} />
                <Typography variant="h3" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#B8860B' }}>
                  {stats.longestCurrentStreak}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Best Current Streak
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={3}>
            <Card sx={{ borderRadius: 4, boxShadow: '8px 8px 16px rgba(160, 150, 180, 0.1)' }}>
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <Box sx={{ fontSize: 40, mb: 1 }}>🏆</Box>
                <Typography variant="h3" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#7C3AED' }}>
                  {stats.longestEverStreak}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  All-Time Record
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={3}>
            <Card sx={{ borderRadius: 4, boxShadow: '8px 8px 16px rgba(160, 150, 180, 0.1)' }}>
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <Box sx={{ fontSize: 40, mb: 1 }}>📊</Box>
                <Typography variant="h3" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#0EA5E9' }}>
                  {stats.averageStreak.toFixed(1)}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Average Streak
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Active Streaks List */}
        <Typography variant="h6" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <WhatshotIcon sx={{ color: '#FF6B35' }} />
          Students with Active Streaks ({studentsWithActiveStreaks.length})
        </Typography>

        {studentsWithActiveStreaks.length === 0 ? (
          <Alert severity="info" sx={{ mb: 4, borderRadius: 4 }}>
            No students have active reading streaks. Encourage daily reading to build streaks!
          </Alert>
        ) : (
          <Paper sx={{ borderRadius: 4, overflow: 'hidden', mb: 4 }}>
            <List>
              {studentsWithActiveStreaks.map((student, index) => (
                <ListItem key={student.id} divider>
                  <ListItemIcon>
                    <Box sx={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      bgcolor: index === 0 ? '#FEF3C7' : index === 1 ? '#F3F4F6' : index === 2 ? '#FED7AA' : 'rgba(255, 107, 53, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {index < 3 ? (
                        <Typography variant="body2" sx={{
                          fontWeight: 800,
                          color: index === 0 ? '#F59E0B' : index === 1 ? '#6B7280' : '#EA580C'
                        }}>
                          {index + 1}
                        </Typography>
                      ) : (
                        <PersonIcon sx={{ color: '#FF6B35' }} />
                      )}
                    </Box>
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography sx={{ fontWeight: 600, fontFamily: '"DM Sans", sans-serif' }}>
                        {student.name}
                      </Typography>
                    }
                    secondary={
                      <Box component="span" sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                        <Typography component="span" variant="caption" color="text.secondary">
                          Best: {student.longestStreak} days
                        </Typography>
                        {student.streakStartDate && (
                          <Typography component="span" variant="caption" color="text.secondary">
                            Started: {new Date(student.streakStartDate).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short'
                            })}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                  <StreakBadge streak={student.currentStreak} size="medium" showLabel />
                </ListItem>
              ))}
            </List>
          </Paper>
        )}

        {/* Students Without Streaks */}
        <Typography variant="h6" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <PersonIcon sx={{ color: '#9CA3AF' }} />
          Students Without Active Streaks ({studentsWithNoStreak.length})
        </Typography>

        {studentsWithNoStreak.length === 0 ? (
          <Alert severity="success" sx={{ borderRadius: 4 }}>
            Amazing! All students have active reading streaks!
          </Alert>
        ) : (
          <Paper sx={{ borderRadius: 4, overflow: 'hidden' }}>
            <List>
              {studentsWithNoStreak.map(student => (
                <ListItem key={student.id} divider>
                  <ListItemIcon>
                    <Box sx={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      bgcolor: '#F3F4F6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <PersonIcon sx={{ color: '#9CA3AF' }} />
                    </Box>
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography sx={{ fontWeight: 600, fontFamily: '"DM Sans", sans-serif' }}>
                        {student.name}
                      </Typography>
                    }
                    secondary={
                      student.longestStreak > 0
                        ? `Previous best: ${student.longestStreak} days`
                        : 'No streak history'
                    }
                  />
                  <Chip
                    label="No streak"
                    size="small"
                    sx={{
                      bgcolor: '#F3F4F6',
                      color: '#6B7280',
                      fontWeight: 600
                    }}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        )}
      </Box>
    );
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#332F3A' }}>
          Reading Statistics
        </Typography>
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
            ) : renderOverviewTab()
          )}
          {currentTab === 1 && (
            students.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
                <Typography variant="body1" color="text.secondary">
                  No data available yet. Add students and record reading sessions to see statistics.
                </Typography>
              </Paper>
            ) : renderStreaksTab()
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