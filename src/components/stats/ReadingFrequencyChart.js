import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Tooltip
} from '@mui/material';
import { useAppContext } from '../../contexts/AppContext';
import { useTheme } from '@mui/material/styles';

const ReadingFrequencyChart = () => {
  const theme = useTheme();
  const { students } = useAppContext();
  
  // Sort students by reading session count (most to least)
  const sortedStudents = [...students].sort((a, b) => 
    b.readingSessions.length - a.readingSessions.length
  );
  
  // Find the maximum number of sessions for scaling
  const maxSessions = Math.max(
    ...students.map(s => s.readingSessions.length),
    5 // Minimum scale (at least 5 sessions)
  );
  
  // Get color based on session count
  const getBarColor = (count) => {
    if (count === 0) return theme.palette.error.main; // No sessions
    if (count < 3) return theme.palette.warning.main; // Few sessions
    return theme.palette.primary.main; // Good number of sessions
  };
  
  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Reading Frequency by Student
      </Typography>
      
      {students.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
          No student data available.
        </Typography>
      ) : (
        <Box sx={{ mt: 3 }}>
          {sortedStudents.map(student => {
            const sessionCount = student.readingSessions.length;
            const barWidth = `${Math.max((sessionCount / maxSessions) * 100, 3)}%`; // Minimum 3% width for visibility
            
            return (
              <Box key={student.id} sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" noWrap sx={{ maxWidth: '60%' }}>
                    {student.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}
                  </Typography>
                </Box>
                <Tooltip 
                  title={`${student.name}: ${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'}`}
                  placement="top"
                >
                  <Box
                    sx={{
                      height: 20,
                      width: barWidth,
                      bgcolor: getBarColor(sessionCount),
                      borderRadius: 1,
                      transition: 'width 0.5s ease-in-out',
                      minWidth: '3px', // Ensure very small values are still visible
                      position: 'relative',
                      '&:hover': {
                        opacity: 0.9,
                      }
                    }}
                  />
                </Tooltip>
              </Box>
            );
          })}
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: theme.palette.primary.main, mr: 1 }} />
              <Typography variant="caption">3+ sessions</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: theme.palette.warning.main, mr: 1 }} />
              <Typography variant="caption">1-2 sessions</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: theme.palette.error.main, mr: 1 }} />
              <Typography variant="caption">No sessions</Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Paper>
  );
};

export default ReadingFrequencyChart;