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

    if (activeStudents.length === 0) {
      return {
        totalStudents: 0,
        totalSessions: 0,
        averageSessionsPerStudent: 0,
        studentsWithNoSessions: 0,
        assessmentDistribution: {
          struggling: 0,
          needsHelp: 0,
          independent: 0
        },
        statusDistribution: {
          notRead: 0,
          needsAttention: 0,
          recentlyRead: 0
        }
      };
    }
    
    let totalSessions = 0;
    let studentsWithNoSessions = 0;
    let assessmentCounts = {
      struggling: 0,
      'needs-help': 0,
      independent: 0
    };
    let statusCounts = {
      notRead: 0,
      needsAttention: 0,
      recentlyRead: 0
    };
    
    // Count sessions and assessments
    activeStudents.forEach(student => {
      const sessionCount = student.readingSessions.length;
      totalSessions += sessionCount;

      if (sessionCount === 0) {
        studentsWithNoSessions++;
      }

      // Count assessments
      student.readingSessions.forEach(session => {
        if (assessmentCounts.hasOwnProperty(session.assessment)) {
          assessmentCounts[session.assessment]++;
        }
      });

      // Count reading status
      const status = getReadingStatus(student);
      statusCounts[status]++;
    });

    return {
      totalStudents: activeStudents.length,
      totalSessions,
      averageSessionsPerStudent: activeStudents.length > 0 ? totalSessions / activeStudents.length : 0,
      studentsWithNoSessions,
      assessmentDistribution: assessmentCounts,
      statusDistribution: statusCounts
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
      
      <Grid item xs={12}>
        <Card sx={{ borderRadius: 4, boxShadow: '8px 8px 16px rgba(160, 150, 180, 0.1)' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}>
              Assessment Distribution
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-around', mt: 4, flexWrap: 'wrap', gap: 2 }}>
              <Box sx={{ textAlign: 'center', p: 2, borderRadius: 3, bgcolor: '#FEE2E2', minWidth: 120 }}>
                <Typography variant="h4" sx={{ color: '#EF4444', fontWeight: 800, fontFamily: '"Nunito", sans-serif' }}>
                  {stats.assessmentDistribution.struggling}
                </Typography>
                <Typography variant="body2" sx={{ color: '#B91C1C', fontWeight: 600 }}>
                  Struggling
                </Typography>
              </Box>
              
              <Box sx={{ textAlign: 'center', p: 2, borderRadius: 3, bgcolor: '#FEF3C7', minWidth: 120 }}>
                <Typography variant="h4" sx={{ color: '#F59E0B', fontWeight: 800, fontFamily: '"Nunito", sans-serif' }}>
                  {stats.assessmentDistribution['needs-help']}
                </Typography>
                <Typography variant="body2" sx={{ color: '#B45309', fontWeight: 600 }}>
                  Needs Help
                </Typography>
              </Box>
              
              <Box sx={{ textAlign: 'center', p: 2, borderRadius: 3, bgcolor: '#D1FAE5', minWidth: 120 }}>
                <Typography variant="h4" sx={{ color: '#10B981', fontWeight: 800, fontFamily: '"Nunito", sans-serif' }}>
                  {stats.assessmentDistribution.independent}
                </Typography>
                <Typography variant="body2" sx={{ color: '#047857', fontWeight: 600 }}>
                  Independent
                </Typography>
              </Box>
            </Box>
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