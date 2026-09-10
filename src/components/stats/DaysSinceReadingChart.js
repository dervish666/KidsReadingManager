import React, { useMemo, useState } from 'react';
import { Box, Typography, Paper, Button } from '@mui/material';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';
import { useTheme } from '@mui/material/styles';

const DaysSinceReadingChart = () => {
  const theme = useTheme();
  const { students, classes } = useData();
  const { globalClassFilter } = useUI();

  // Filter students based on global class filter and disabled classes
  const activeStudents = useMemo(() => {
    const disabledClassIds = classes.filter((cls) => cls.disabled).map((cls) => cls.id);

    return students.filter((student) => {
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
  }, [students, globalClassFilter, classes]);

  // Calculate days since last reading for each student
  const studentData = useMemo(() => {
    return activeStudents
      .map((student) => {
        const daysSinceReading = student.lastReadDate
          ? Math.floor((new Date() - new Date(student.lastReadDate)) / (1000 * 60 * 60 * 24))
          : null;

        return {
          id: student.id,
          name: student.name,
          daysSinceReading,
          hasNeverRead: !student.lastReadDate,
          totalSessions: student.totalSessionCount || 0,
        };
      })
      .sort((a, b) => {
        // Sort by never read first, then by days since reading (descending)
        if (a.hasNeverRead && !b.hasNeverRead) return -1;
        if (!a.hasNeverRead && b.hasNeverRead) return 1;
        return (b.daysSinceReading || 0) - (a.daysSinceReading || 0);
      });
  }, [activeStudents]);

  const [showAll, setShowAll] = useState(false);
  const displayStudents = showAll ? studentData : studentData.slice(0, 30);

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
          {displayStudents.map((student) => (
            <Box
              key={student.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                py: 1,
                borderBottom: '1px solid rgba(139, 115, 85, 0.12)',
                '&:last-of-type': { borderBottom: 'none' },
              }}
            >
              <Box
                aria-hidden="true"
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  bgcolor: getBarColor(student.daysSinceReading),
                  flexShrink: 0,
                }}
              />
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
                {student.name}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ whiteSpace: 'nowrap', display: { xs: 'none', sm: 'block' } }}
              >
                {student.totalSessions} {student.totalSessions === 1 ? 'session' : 'sessions'}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  whiteSpace: 'nowrap',
                  fontWeight: 600,
                  color: getBarColor(student.daysSinceReading),
                  minWidth: 92,
                  textAlign: 'right',
                }}
              >
                {getDaysLabel(student.daysSinceReading)}
              </Typography>
            </Box>
          ))}

          {studentData.length > 30 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button
                size="small"
                onClick={() => setShowAll((prev) => !prev)}
                sx={{
                  textTransform: 'none',
                  fontFamily: '"DM Sans", sans-serif',
                  fontWeight: 600,
                }}
              >
                {showAll ? 'Show top 30' : `Show all ${studentData.length} students`}
              </Button>
            </Box>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  bgcolor: theme.palette.success.main,
                  mr: 1,
                }}
              />
              <Typography variant="caption">Recent (≤ 7 days)</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  bgcolor: theme.palette.warning.main,
                  mr: 1,
                }}
              />
              <Typography variant="caption">Attention (8-14 days)</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  bgcolor: theme.palette.error.main,
                  mr: 1,
                }}
              />
              <Typography variant="caption">Urgent ({'>'}14 days)</Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Paper>
  );
};

export default DaysSinceReadingChart;
