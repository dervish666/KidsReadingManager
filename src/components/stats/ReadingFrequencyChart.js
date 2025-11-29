import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Tooltip
} from '@mui/material';
import { useAppContext } from '../../contexts/AppContext';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';

const ReadingFrequencyChart = () => {
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'));
  const { students, classes, globalClassFilter } = useAppContext();

  // Get IDs of disabled classes
  const disabledClassIds = classes.filter(cls => cls.disabled).map(cls => cls.id);

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
    return !student.classId || !disabledClassIds.includes(student.classId);
  });
  
  // Sort students by reading session count (most to least)
  const sortedStudents = [...activeStudents].sort((a, b) =>
    b.readingSessions.length - a.readingSessions.length
  );

  // Find the maximum number of sessions for scaling
  const maxSessions = Math.max(
    ...activeStudents.map(s => s.readingSessions.length),
    5 // Minimum scale (at least 5 sessions)
  );
  
  // Get color based on session count
  const getBarColor = (count) => {
    if (count === 0) return theme.palette.error.main; // No sessions
    if (count < 3) return theme.palette.warning.main; // Few sessions
    return theme.palette.primary.main; // Good number of sessions
  };
  
  return (
    <Paper sx={{ p: 3, mb: 3, pb: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
      <Typography variant="h6" gutterBottom>
        Reading Frequency by Student
      </Typography>
      
      {activeStudents.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
          No student data available.
        </Typography>
      ) : (
        <Box sx={{ mt: 3 }}>
          {sortedStudents.map(student => {
            const sessionCount = student.readingSessions.length;
            const basePercent = Math.max((sessionCount / maxSessions) * 100, 3); // Base percent
            const adjustedPercent = isSmall ? Math.max(basePercent, 6) : basePercent; // Larger min on small screens
            const barWidth = `${Math.min(adjustedPercent, 100)}%`;
            
            return (
              <Box key={student.id} sx={{ mb: 2, width: '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
                  <Typography variant="body2" sx={{ maxWidth: { xs: '100%', sm: '60%' }, wordBreak: 'break-word' }}>
                    {student.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                    {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}
                  </Typography>
                </Box>
                <Tooltip
                  title={`${student.name}: ${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'}`}
                  placement="top"
                >
                  <Box sx={{ mt: { xs: 1, sm: 0 } }}>
                    <Box
                      sx={{
                        height: { xs: 18, sm: 20 },
                        width: barWidth,
                        bgcolor: getBarColor(sessionCount),
                        borderRadius: 1,
                        transition: 'width 0.4s ease-in-out',
                        minWidth: '6px', // Ensure very small values are still visible on touch
                        position: 'relative',
                        '&:hover': {
                          opacity: 0.9,
                        }
                      }}
                    />
                  </Box>
                </Tooltip>
              </Box>
            );
          })}
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: theme.palette.primary.main, mr: 1 }} />
              <Typography variant="caption">3+ sessions</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: theme.palette.warning.main, mr: 1 }} />
              <Typography variant="caption">1-2 sessions</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: theme.palette.error.main, mr: 1 }} />
              <Typography variant="caption">No sessions</Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Paper>
  );
};

export default ReadingFrequencyChart;