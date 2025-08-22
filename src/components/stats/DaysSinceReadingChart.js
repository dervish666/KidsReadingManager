import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Tooltip,
  LinearProgress
} from '@mui/material';
import { useAppContext } from '../../contexts/AppContext';
import { useTheme } from '@mui/material/styles';

const DaysSinceReadingChart = () => {
  const theme = useTheme();
  const { students } = useAppContext();
  
  // Calculate days since last reading for each student
  const calculateDaysSinceReading = () => {
    return students.map(student => {
      const daysSinceReading = student.lastReadDate 
        ? Math.floor((new Date() - new Date(student.lastReadDate)) / (1000 * 60 * 60 * 24))
        : null;
      
      return {
        id: student.id,
        name: student.name,
        daysSinceReading,
        hasNeverRead: !student.lastReadDate,
        totalSessions: student.readingSessions.length
      };
    })
    .sort((a, b) => {
      // Sort by never read first, then by days since reading (descending)
      if (a.hasNeverRead && !b.hasNeverRead) return -1;
      if (!a.hasNeverRead && b.hasNeverRead) return 1;
      return (b.daysSinceReading || 0) - (a.daysSinceReading || 0);
    });
  };
  
  const studentData = calculateDaysSinceReading();
  
  // Find the maximum days for scaling the bars
  const maxDays = Math.max(
    ...studentData.map(s => s.daysSinceReading || 0),
    21 // Minimum scale (3 weeks)
  );
  
  // Get color based on days
  const getBarColor = (days) => {
    if (days === null) return theme.palette.error.main; // Never read
    if (days > 14) return theme.palette.error.main; // More than 2 weeks
    if (days > 7) return theme.palette.warning.main; // More than 1 week
    return theme.palette.success.main; // Less than 1 week
  };
  
  // Get label based on days
  const getDaysLabel = (days) => {
    if (days === null) return 'Never read';
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  };
  
  return (
    <Paper sx={{ p: 3, mb: 3, pb: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
      <Typography variant="h6" gutterBottom>
        Days Since Last Reading
      </Typography>
      
      {studentData.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
          No student data available.
        </Typography>
      ) : (
        <Box sx={{ mt: 3 }}>
          {studentData.map(student => (
            <Box key={student.id} sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
                <Typography variant="body2" sx={{ maxWidth: { xs: '100%', sm: '60%' }, wordBreak: 'break-word' }}>
                  {student.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                  {getDaysLabel(student.daysSinceReading)}
                </Typography>
              </Box>
              <Tooltip
                title={`${student.name}: ${getDaysLabel(student.daysSinceReading)} | ${student.totalSessions} total sessions`}
                placement="top"
              >
                <Box sx={{ mt: { xs: 1, sm: 0 } }}>
                  <LinearProgress
                    variant="determinate"
                    value={student.daysSinceReading !== null ? (student.daysSinceReading / maxDays) * 100 : 100}
                    sx={{
                      height: 10,
                      borderRadius: 5,
                      bgcolor: 'rgba(0, 0, 0, 0.1)',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: getBarColor(student.daysSinceReading),
                        borderRadius: 5,
                      },
                    }}
                  />
                </Box>
              </Tooltip>
            </Box>
          ))}
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: theme.palette.success.main, mr: 1 }} />
              <Typography variant="caption">Recent (≤ 7 days)</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: theme.palette.warning.main, mr: 1 }} />
              <Typography variant="caption">Attention (8-14 days)</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: theme.palette.error.main, mr: 1 }} />
              <Typography variant="caption">Urgent ({'>'}14 days)</Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Paper>
  );
};

export default DaysSinceReadingChart;