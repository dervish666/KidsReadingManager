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
import VisualIndicators from './VisualIndicators';
import DaysSinceReadingChart from './DaysSinceReadingChart';
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
        readingByDay: { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 }
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
    });

    // Get top 5 most read books
    const mostReadBooks = Object.entries(bookCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([title, count]) => ({ title, count }));

    return {
      totalStudents: activeStudents.length,
      totalSessions,
      averageSessionsPerStudent: activeStudents.length > 0 ? totalSessions / activeStudents.length : 0,
      studentsWithNoSessions,
      statusDistribution: statusCounts,
      locationDistribution: locationCounts,
      weeklyActivity: { thisWeek: thisWeekSessions, lastWeek: lastWeekSessions },
      mostReadBooks,
      readingByDay: dayCounts
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
      
      <Grid item xs={12}>
        <Card sx={{ borderRadius: 4, boxShadow: '8px 8px 16px rgba(160, 150, 180, 0.1)' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}>
              Reading Status Distribution
            </Typography>
            <VisualIndicators data={stats.statusDistribution} />
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
            ) : renderNeedsAttentionTab()
          )}
          {currentTab === 2 && (
            students.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
                <Typography variant="body1" color="text.secondary">
                  No data available yet. Add students and record reading sessions to see statistics.
                </Typography>
              </Paper>
            ) : renderFrequencyTab()
          )}
          {currentTab === 3 && (
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