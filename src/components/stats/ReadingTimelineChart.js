import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  useMediaQuery
} from '@mui/material';
import { useAppContext } from '../../contexts/AppContext';
import { useTheme } from '@mui/material/styles';
import { formatAssessmentDisplay } from '../../utils/helpers';

const ReadingTimelineChart = () => {
  const theme = useTheme();
  const { students, classes } = useAppContext();

  // Get IDs of disabled classes
  const disabledClassIds = classes.filter(cls => cls.disabled).map(cls => cls.id);

  // Filter out students from disabled classes
  const activeStudents = students.filter(student => {
    return !student.classId || !disabledClassIds.includes(student.classId);
  });
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

    return activeStudents.map(student => {
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
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'));
  const getVisibleDates = () => {
    // Choose max visible columns based on timeRange and screen size
    const maxDates = (() => {
      if (timeRange === '7') return isSmall ? 7 : 7;
      if (timeRange === '30') return isSmall ? 6 : 10;
      if (timeRange === '90') return isSmall ? 8 : 12;
      return isSmall ? 10 : 14;
    })();
    
    // If we have fewer dates than max, show all
    if (timelineDates.length <= maxDates) {
      return timelineDates;
    }
    
    // Otherwise, sample dates evenly to fit the available columns
    const step = Math.ceil(timelineDates.length / maxDates);
    const sampledDates = [];
    
    for (let i = 0; i < timelineDates.length; i += step) {
      sampledDates.push(timelineDates[i]);
    }
    
    // Ensure last (most recent) date is included
    const lastDate = timelineDates[timelineDates.length - 1];
    if (sampledDates[sampledDates.length - 1].toDateString() !== lastDate.toDateString()) {
      sampledDates.push(lastDate);
    }
    
    return sampledDates;
  };
  
  const visibleDates = getVisibleDates();
  
  return (
    <Paper sx={{ p: 3, mb: 3, pb: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 1, sm: 0 } }}>
        <Typography variant="h6">
          Reading Timeline
        </Typography>
        <FormControl size="small" sx={{ minWidth: 120, width: { xs: '100%', sm: 'auto' } }}>
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
          <Box sx={{ display: 'flex', mb: 2, pl: { xs: 6, sm: 12 }, overflowX: 'auto' }}>
            {visibleDates.map((date, index) => (
              <Box
                key={index}
                sx={{
                  minWidth: { xs: 44, sm: 56 },
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
              <Box sx={{ width: { xs: 110, sm: 150 }, pr: 2, flexShrink: 0 }}>
                <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
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
                        minWidth: { xs: 44, sm: 56 },
                        height: 28,
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
                                Assessment: {formatAssessmentDisplay(session.assessment)}
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
                              borderRadius: 1,
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
              <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: theme.palette.success.main, mr: 1 }} />
              <Typography variant="caption">{formatAssessmentDisplay('independent')}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: theme.palette.warning.main, mr: 1 }} />
              <Typography variant="caption">{formatAssessmentDisplay('needs_help')}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: theme.palette.error.main, mr: 1 }} />
              <Typography variant="caption">{formatAssessmentDisplay('struggling')}</Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Paper>
  );
};

export default ReadingTimelineChart;