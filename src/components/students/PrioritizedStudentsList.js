import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Slider,
  Chip,
  Paper,
  Collapse,
  IconButton,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';
import { STATUS_TO_PALETTE } from '../../utils/helpers';

const StudentPriorityCard = ({ student, priorityRank, onClick }) => {
  const { getReadingStatus } = useUI();

  const status = getReadingStatus(student);
  const paletteKey = STATUS_TO_PALETTE[status] || 'notRead';

  const mostRecentReadDate = student.lastReadDate || null;

  const getDaysSinceReading = () => {
    const dateToUse = mostRecentReadDate || student.lastReadDate;
    if (!dateToUse) return 'Never read';

    const lastReadDate = new Date(dateToUse);
    const today = new Date();
    const diffTime = Math.abs(today - lastReadDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return `${diffDays} days ago`;
  };

  return (
    <Card
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Open details for ${student.name}`}
      sx={{
        position: 'relative',
        overflow: 'visible',
        cursor: 'pointer',
        borderRadius: '12px',
        backgroundColor: 'background.paper',
        boxShadow: '0 4px 12px rgba(139, 115, 85, 0.15), 0 2px 4px rgba(0, 0, 0, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.6)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        '@media (hover: hover) and (pointer: fine)': {
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: '0 8px 24px rgba(139, 115, 85, 0.2), 0 4px 8px rgba(0, 0, 0, 0.08)',
            zIndex: 10,
          },
        },
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: 2,
        },
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: -8,
          left: -8,
          background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
          color: 'white',
          width: 28,
          height: 28,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: '0.8rem',
          boxShadow: '2px 2px 6px rgba(107, 142, 107, 0.3)',
          border: '2px solid white',
          fontFamily: '"Nunito", sans-serif',
        }}
      >
        {priorityRank}
      </Box>
      <CardContent sx={{ pt: 2, pb: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
        <Typography
          variant="body1"
          component="h3"
          sx={{
            fontFamily: '"Nunito", sans-serif',
            fontWeight: 800,
            color: 'text.primary',
            ml: 0.5,
            mb: 0.5,
            fontSize: '0.95rem',
          }}
        >
          {student.name}
        </Typography>

        <Box
          sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Last read:
          </Typography>
          <Chip
            label={
              mostRecentReadDate || student.lastReadDate
                ? new Date(mostRecentReadDate || student.lastReadDate).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                  })
                : 'Never'
            }
            size="small"
            sx={{
              height: 20,
              fontSize: '0.7rem',
              fontWeight: 700,
              borderRadius: 1.5,
              backgroundColor:
                paletteKey === 'notRead'
                  ? 'rgba(158, 75, 75, 0.1)'
                  : paletteKey === 'needsAttention'
                    ? 'rgba(155, 110, 58, 0.1)'
                    : 'rgba(74, 110, 74, 0.1)',
              color:
                paletteKey === 'notRead'
                  ? 'error.main'
                  : paletteKey === 'needsAttention'
                    ? 'warning.main'
                    : 'primary.main',
              border: 'none',
            }}
          />
        </Box>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: 'block',
            textAlign: 'right',
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: '0.7rem',
          }}
        >
          {getDaysSinceReading()}
        </Typography>
      </CardContent>
    </Card>
  );
};

const PrioritizedStudentsList = ({ defaultCount = 8, filterClassId = 'all' }) => {
  const [expanded, setExpanded] = useState(true);
  const [count, setCount] = useState(defaultCount);
  const { classes } = useData();
  const {
    prioritizedStudents: contextPrioritizedStudents,
    updatePriorityStudentCount,
    priorityStudentCount,
    markedPriorityStudentIds,
    markStudentAsPriorityHandled,
    resetPriorityList,
  } = useUI();

  const handleStudentClick = useCallback(
    (studentId) => {
      if (markStudentAsPriorityHandled) {
        markStudentAsPriorityHandled(studentId);
      }
    },
    [markStudentAsPriorityHandled]
  );

  const handleResetList = useCallback(() => {
    if (resetPriorityList) {
      resetPriorityList();
    }
  }, [resetPriorityList]);

  useEffect(() => {
    setCount(priorityStudentCount);
  }, [priorityStudentCount]);

  const prioritizedStudents = useMemo(() => {
    const safeClasses = Array.isArray(classes) ? classes : [];
    const safeContextPrioritizedStudents = Array.isArray(contextPrioritizedStudents)
      ? contextPrioritizedStudents
      : [];
    const disabledClassIds = safeClasses.filter((cls) => cls.disabled).map((cls) => cls.id);

    const filtered = safeContextPrioritizedStudents.filter((student) => {
      if (student.classId && disabledClassIds.includes(student.classId)) {
        return false;
      }
      if (filterClassId === 'all') return true;
      if (filterClassId === 'unassigned') return !student.classId;
      return student.classId === filterClassId;
    });

    const sliced = filtered.slice(0, count);
    return sliced.filter(
      (student) => !markedPriorityStudentIds || !markedPriorityStudentIds.has(student.id)
    );
  }, [contextPrioritizedStudents, classes, filterClassId, count, markedPriorityStudentIds]);

  const handleCountChange = (event, newValue) => {
    setCount(newValue);
    if (typeof updatePriorityStudentCount === 'function') {
      updatePriorityStudentCount(newValue);
    }
  };

  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  return (
    <Paper
      sx={{
        p: 3,
        mb: 4,
        borderRadius: '16px',
        backgroundColor: 'background.paper',
        boxShadow: '0 8px 32px rgba(139, 115, 85, 0.12), 0 2px 8px rgba(0, 0, 0, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.5)',
      }}
    >
      <Box
        data-tour="students-priority-list"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}
      >
        <Typography
          variant="h5"
          sx={{
            flexGrow: 1,
            fontFamily: '"Nunito", sans-serif',
            fontWeight: 800,
            color: 'text.primary',
          }}
        >
          Priority Reading List
        </Typography>
        <IconButton
          onClick={handleResetList}
          size="small"
          aria-label="Reset list"
          title="Reset List"
          sx={{
            color: 'primary.main',
            bgcolor: 'rgba(107, 142, 107, 0.1)',
            mr: 1,
            '&:hover': { bgcolor: 'rgba(107, 142, 107, 0.2)' },
          }}
        >
          <RefreshIcon />
        </IconButton>
        <IconButton
          onClick={toggleExpanded}
          size="small"
          aria-label={expanded ? 'Collapse list' : 'Expand list'}
          title={expanded ? 'Collapse' : 'Expand'}
          sx={{
            color: 'text.secondary',
            bgcolor: 'rgba(122, 122, 122, 0.1)',
            '&:hover': { bgcolor: 'rgba(122, 122, 122, 0.2)' },
          }}
        >
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ mb: 2, px: 1 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom sx={{ fontWeight: 600 }}>
            Number of students to display: {count}
          </Typography>
          <Box sx={{ px: 1, width: '100%' }}>
            <Slider
              value={count}
              onChange={handleCountChange}
              min={1}
              max={15}
              step={1}
              marks={[
                { value: 1, label: '1' },
                { value: 8, label: '8' },
                { value: 15, label: '15' },
              ]}
              valueLabelDisplay="auto"
              sx={{
                width: '100%',
                color: 'primary.main',
                '& .MuiSlider-thumb': {
                  boxShadow: '0 4px 8px rgba(107, 142, 107, 0.4)',
                },
                '& .MuiSlider-rail': {
                  opacity: 0.3,
                },
              }}
            />
          </Box>
        </Box>

        <Grid container spacing={2}>
          {prioritizedStudents.map((student, index) => (
            <Grid key={student.id} size={{ xs: 6, sm: 4, md: 3 }}>
              <StudentPriorityCard
                student={student}
                priorityRank={index + 1}
                onClick={() => handleStudentClick(student.id)}
              />
            </Grid>
          ))}
        </Grid>

        {prioritizedStudents.length === 0 && (
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ textAlign: 'center', py: 4, fontStyle: 'italic' }}
          >
            No students available. Add students to see the priority list.
          </Typography>
        )}
      </Collapse>
    </Paper>
  );
};

export default PrioritizedStudentsList;
