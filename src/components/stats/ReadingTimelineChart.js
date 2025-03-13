import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Chip,
  Tooltip
} from '@mui/material';
import { useAppContext } from '../../contexts/AppContext';
import { useTheme } from '@mui/material/styles';

const ReadingTimelineChart = () => {
  const theme = useTheme();
  const { students } = useAppContext();
  const [timeRange, setTimeRange] = useState('30'); // Default to 30 days
  
  const handleTimeRangeChange = (event) => {
    setTimeRange(event.target.value);
  };
  
  // Get the date range for the timeline
  const getDateRange = () => {
    const endDate = new Date();
    const startDate = new Date();
    
    // Set start date based on selected time range
    if (timeRange === '7') {
      startDate.setDate(endDate.getDate() - 7); // 1 week
    } else if (timeRange === '30') {
      startDate.setDate(endDate.getDate() - 30); // 30 days
    } else if (timeRange === '90') {
      startDate.setDate(endDate.getDate() - 90); // 90 days
    } else {
      startDate.setFullYear(endDate.getFullYear() - 1); // 1 year
    }
    
    return { startDate, endDate };
  };
  
  // Generate dates for the timeline
  const generateTimelineDates = () => {
    const { startDate, endDate } = getDateRange();
    const dates = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dates;
  };
  
  // Get reading sessions within the date range
  const getReadingSessions = () => {
    const { startDate, endDate } = getDateRange();
    
    return students.map(student => {
      // Filter sessions within the date range
      const sessionsInRange = student.readingSessions.filter(session => {
        const sessionDate = new Date(session.date);
        return sessionDate >= startDate && sessionDate <= endDate;
      });
      
      return {
        id: student.id,
        name: student.name,
        sessions: sessionsInRange,
        lastReadDate: student.lastReadDate ? new Date(student.lastReadDate) : null
      };
    })
    .sort((a, b) => {
      // Sort by most recent reading first
      if (!a.lastReadDate && !b.lastReadDate) return 0;
      if (!a.lastReadDate) return 1;
      if (!b.lastReadDate) return -1;
      return b.lastReadDate - a.lastReadDate;
    });
  };
  
  const timelineDates = generateTimelineDates();
  const studentSessions = getReadingSessions();
  
  // Format date for display
  const formatDate = (date) => {
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short'
    });
  };
  
  // Get assessment color
  const getAssessmentColor = (assessment) => {
    switch (assessment) {
      case 'struggling':
        return theme.palette.error.main;
      case 'needs-help':
        return theme.palette.warning.main;
      case 'independent':
        return theme.palette.success.main;
      default:
        return theme.palette.primary.main;
    }
  };
  
  // Check if a student has a session on a specific date
  const hasSessionOnDate = (student, date) => {
    return student.sessions.find(session => {
      const sessionDate = new Date(session.date);
      return sessionDate.toDateString() === date.toDateString();
    });
  };
  
  // Determine how many dates to show based on screen size
  const getVisibleDates = () => {
    // For simplicity, we'll show a fixed number
    // In a real app, this could be responsive based on screen width
    const maxDates = timeRange === '7' ? 7 : 
                     timeRange === '30' ? 10 : 
                     timeRange === '90' ? 12 : 12;
    
    // If we have fewer dates than max, show all
    if (timelineDates.length <= maxDates) {
      return timelineDates;
    }
    
    // Otherwise, sample dates evenly
    const step = Math.ceil(timelineDates.length / maxDates);
    const sampledDates = [];
    
    for (let i = 0; i < timelineDates.length; i += step) {
      sampledDates.push(timelineDates[i]);
    }
    
    // Always include the most recent date
    if (sampledDates[sampledDates.length - 1] !== timelineDates[timelineDates.length - 1]) {
      sampledDates.push(timelineDates[timelineDates.length - 1]);
    }
    
    return sampledDates;
  };
  
  const visibleDates = getVisibleDates();
  
  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">
          Reading Timeline
        </Typography>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel id="time-range-label">Time Range</InputLabel>
          <Select
            labelId="time-range-label"
            id="time-range-select"
            value={timeRange}
            label="Time Range"
            onChange={handleTimeRangeChange}
          >
            <MenuItem value="7">7 Days</MenuItem>
            <MenuItem value="30">30 Days</MenuItem>
            <MenuItem value="90">90 Days</MenuItem>
            <MenuItem value="365">1 Year</MenuItem>
          </Select>
        </FormControl>
      </Box>
      
      {studentSessions.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
          No student data available.
        </Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          {/* Timeline header with dates */}
          <Box sx={{ display: 'flex', mb: 2, pl: 15 }}>
            {visibleDates.map((date, index) => (
              <Box 
                key={index} 
                sx={{ 
                  minWidth: 60, 
                  textAlign: 'center',
                  borderRight: index < visibleDates.length - 1 ? '1px dashed #eee' : 'none'
                }}
              >
                <Typography variant="caption" noWrap>
                  {formatDate(date)}
                </Typography>
              </Box>
            ))}
          </Box>
          
          {/* Student rows */}
          {studentSessions.map(student => (
            <Box 
              key={student.id} 
              sx={{ 
                display: 'flex', 
                mb: 2,
                alignItems: 'center',
                '&:hover': {
                  bgcolor: 'rgba(0, 0, 0, 0.02)'
                }
              }}
            >
              {/* Student name */}
              <Box sx={{ width: 150, pr: 2, flexShrink: 0 }}>
                <Typography variant="body2" noWrap>
                  {student.name}
                </Typography>
              </Box>
              
              {/* Timeline cells */}
              <Box sx={{ display: 'flex', flexGrow: 1 }}>
                {visibleDates.map((date, index) => {
                  const session = hasSessionOnDate(student, date);
                  
                  return (
                    <Box 
                      key={index} 
                      sx={{ 
                        minWidth: 60, 
                        height: 30,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderRight: index < visibleDates.length - 1 ? '1px dashed #eee' : 'none'
                      }}
                    >
                      {session && (
                        <Tooltip 
                          title={
                            <Box>
                              <Typography variant="body2">{student.name}</Typography>
                              <Typography variant="body2">
                                Date: {new Date(session.date).toLocaleDateString('en-GB')}
                              </Typography>
                              <Typography variant="body2">
                                Assessment: {session.assessment.replace('-', ' ')}
                              </Typography>
                              {session.notes && (
                                <Typography variant="body2">
                                  Notes: {session.notes}
                                </Typography>
                              )}
                            </Box>
                          }
                        >
                          <Box 
                            sx={{ 
                              width: 20, 
                              height: 20, 
                              borderRadius: '50%', 
                              bgcolor: getAssessmentColor(session.assessment),
                              cursor: 'pointer'
                            }} 
                          />
                        </Tooltip>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          ))}
          
          {/* Legend */}
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3, flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: theme.palette.success.main, mr: 1 }} />
              <Typography variant="caption">Independent</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: theme.palette.warning.main, mr: 1 }} />
              <Typography variant="caption">Needs Help</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: theme.palette.error.main, mr: 1 }} />
              <Typography variant="caption">Struggling</Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Paper>
  );
};

export default ReadingTimelineChart;