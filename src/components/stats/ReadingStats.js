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
import SettingsIcon from '@mui/icons-material/Settings';
import TimelineIcon from '@mui/icons-material/Timeline';
import CodeIcon from '@mui/icons-material/Code';
import VisualIndicators from './VisualIndicators';
import DaysSinceReadingChart from './DaysSinceReadingChart';
import ReadingTimelineChart from './ReadingTimelineChart';
import ReadingFrequencyChart from './ReadingFrequencyChart';
import DataManagement from '../DataManagement';
import Settings from '../Settings';
import JsonEditor from './JsonEditor';
import { useAppContext } from '../../contexts/AppContext';

const ReadingStats = () => {
  const { students, exportToJson, getReadingStatus } = useAppContext();
  const [currentTab, setCurrentTab] = useState(0);
  
  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
  };
  
  const handleExport = () => {
    exportToJson();
  };
  
  // Calculate statistics
  const calculateStats = () => {
    if (students.length === 0) {
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
    students.forEach(student => {
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
      totalStudents: students.length,
      totalSessions,
      averageSessionsPerStudent: totalSessions / students.length,
      studentsWithNoSessions,
      assessmentDistribution: assessmentCounts,
      statusDistribution: statusCounts
    };
  };
  
  const stats = calculateStats();
  
  // Get students sorted by session count (least to most)
  const getStudentsBySessionCount = () => {
    return [...students].sort((a, b) => 
      a.readingSessions.length - b.readingSessions.length
    );
  };
  
  // Get students who haven't been read with recently
  const getNeedsAttentionStudents = () => {
    return students.filter(student => getReadingStatus(student) === 'notRead');
  };
  
  const renderOverviewTab = () => (
    <Grid container spacing={3}>
      {/* Corrected Grid item props */}
      <Grid
        size={{
          xs: 12,
          sm: 6,
          md: 3
        }}>
        <Card>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              Total Students
            </Typography>
            <Typography variant="h4">
              {stats.totalStudents}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      
      {/* Corrected Grid item props */}
      <Grid
        size={{
          xs: 12,
          sm: 6,
          md: 3
        }}>
        <Card>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              Total Reading Sessions
            </Typography>
            <Typography variant="h4">
              {stats.totalSessions}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      
      {/* Corrected Grid item props */}
      <Grid
        size={{
          xs: 12,
          sm: 6,
          md: 3
        }}>
        <Card>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              Avg. Sessions per Student
            </Typography>
            <Typography variant="h4">
              {stats.averageSessionsPerStudent.toFixed(1)}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      
      {/* Corrected Grid item props */}
      <Grid
        size={{
          xs: 12,
          sm: 6,
          md: 3
        }}>
        <Card>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              Students Never Read With
            </Typography>
            <Typography variant="h4">
              {stats.studentsWithNoSessions}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      
      {/* Corrected Grid item props */}
      <Grid size={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Reading Status Distribution
            </Typography>
            <VisualIndicators data={stats.statusDistribution} />
          </CardContent>
        </Card>
      </Grid>
      
      {/* Corrected Grid item props */}
      <Grid size={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Assessment Distribution
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-around', mt: 2 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h5" color="error.main">
                  {stats.assessmentDistribution.struggling}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Struggling
                </Typography>
              </Box>
              
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h5" color="warning.main">
                  {stats.assessmentDistribution['needs-help']}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Needs Help
                </Typography>
              </Box>
              
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h5" color="success.main">
                  {stats.assessmentDistribution.independent}
                </Typography>
                <Typography variant="body2" color="text.secondary">
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
        <Typography variant="h6" gutterBottom>
          Students Needing Attention
        </Typography>
        
        {needsAttentionStudents.length === 0 ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            Great job! All students have been read with recently.
          </Alert>
        ) : (
          <List>
            {needsAttentionStudents.map(student => (
              <ListItem key={student.id} divider>
                <ListItemIcon>
                  <PersonIcon />
                </ListItemIcon>
                <ListItemText
                  primary={student.name}
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
                  color="error" 
                  size="small" 
                />
              </ListItem>
            ))}
          </List>
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
        <Typography variant="h6" gutterBottom>
          Reading Frequency Details
        </Typography>
        
        <List>
          {sortedStudents.map(student => (
            <ListItem key={student.id} divider>
              <ListItemIcon>
                <PersonIcon />
              </ListItemIcon>
              <ListItemText
                primary={student.name}
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
                color={student.readingSessions.length === 0 ? "error" : "primary"}
                size="small"
              />
            </ListItem>
          ))}
        </List>
      </Box>
    );
  };
  
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" component="h1">
          Reading Statistics
        </Typography>
        <Button 
          variant="outlined" 
          startIcon={<DownloadIcon />}
          onClick={handleExport}
        >
          Export Data
        </Button>
      </Box>
      
      <Box>
        <Paper sx={{ mb: 3, overflow: 'hidden' }}>
          <Tabs
            value={currentTab}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            indicatorColor="primary"
            textColor="primary"
            aria-label="Statistics tabs"
          >
            <Tab icon={<AssessmentIcon />} label="Overview" />
            <Tab icon={<CalendarTodayIcon />} label="Needs Attention" />
            <Tab icon={<MenuBookIcon />} label="Reading Frequency" />
            <Tab icon={<TimelineIcon />} label="Reading Timeline" />
            <Tab icon={<SettingsIcon />} label="Data Management" />
            <Tab icon={<SettingsIcon />} label="Settings" />
            <Tab icon={<CodeIcon />} label="JSON Editor" />
          </Tabs>
        </Paper>
        
        <Box sx={{ p: 2 }}>
          {currentTab === 0 && (
            students.length === 0 ? (
              <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body1">
                  No data available yet. Add students and record reading sessions to see statistics.
                </Typography>
              </Paper>
            ) : renderOverviewTab()
          )}
          {currentTab === 1 && (
            students.length === 0 ? (
              <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body1">
                  No data available yet. Add students and record reading sessions to see statistics.
                </Typography>
              </Paper>
            ) : renderNeedsAttentionTab()
          )}
          {currentTab === 2 && (
            students.length === 0 ? (
              <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body1">
                  No data available yet. Add students and record reading sessions to see statistics.
                </Typography>
              </Paper>
            ) : renderFrequencyTab()
          )}
          {currentTab === 3 && (
            students.length === 0 ? (
              <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body1">
                  No data available yet. Add students and record reading sessions to see statistics.
                </Typography>
              </Paper>
            ) : (
              <Box>
                <DaysSinceReadingChart />
                <ReadingTimelineChart />
              </Box>
            )
          )}
          {currentTab === 4 && <DataManagement />}
          {currentTab === 5 && <Settings />}
          {currentTab === 6 && <JsonEditor />}
        </Box>
      </Box>
    </Box>
  );
};

export default ReadingStats;