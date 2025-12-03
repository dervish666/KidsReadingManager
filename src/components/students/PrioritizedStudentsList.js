import React, { useState, useCallback, useEffect } from 'react';
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
  IconButton
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAppContext } from '../../contexts/AppContext';
import { useTheme } from '@mui/material/styles';

const StudentPriorityCard = ({ student, priorityRank, onClick }) => {
  const theme = useTheme();
  const { getReadingStatus } = useAppContext();
  
  const status = getReadingStatus(student);
  const statusColors = {
    notRead: theme.palette.status?.notRead || '#EF4444',
    needsAttention: theme.palette.status?.needsAttention || '#F59E0B',
    recentlyRead: theme.palette.status?.recentlyRead || '#10B981'
  };
  
  const getMostRecentReadDate = () => {
    if (!student.readingSessions || student.readingSessions.length === 0) {
      return null;
    }
    
    const sortedSessions = [...student.readingSessions].sort((a, b) =>
      new Date(b.date) - new Date(a.date)
    );
    
    return sortedSessions[0].date;
  };
  
  const mostRecentReadDate = getMostRecentReadDate();
  
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
      sx={{
        position: 'relative',
        overflow: 'visible',
        cursor: 'pointer',
        borderRadius: '12px',
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 4px 12px rgba(160, 150, 180, 0.15), 0 2px 4px rgba(0, 0, 0, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.6)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: '0 8px 24px rgba(160, 150, 180, 0.2), 0 4px 8px rgba(0, 0, 0, 0.08)',
          zIndex: 10,
        }
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: -10,
          left: -10,
          background: 'linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)',
          color: 'white',
          width: 36,
          height: 36,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: '1rem',
          boxShadow: '4px 4px 8px rgba(139, 92, 246, 0.3), -4px -4px 8px rgba(255, 255, 255, 0.4)',
          border: '2px solid white',
          fontFamily: '"Nunito", sans-serif'
        }}
      >
        {priorityRank}
      </Box>
      <CardContent sx={{ pt: 3, pb: 2 }}>
        <Typography variant="h6" component="h3" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#332F3A', ml: 1 }}>
          {student.name}
        </Typography>
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, p: 1, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.5)' }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Last read:
          </Typography>
          <Chip
            label={(mostRecentReadDate || student.lastReadDate)
              ? new Date(mostRecentReadDate || student.lastReadDate).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
                })
              : 'Never'}
            size="small"
            sx={{
              height: 24,
              fontSize: '0.75rem',
              fontWeight: 700,
              borderRadius: 2,
              backgroundColor: status === 'notRead' ? '#FEE2E2' : status === 'needsAttention' ? '#FEF3C7' : '#D1FAE5',
              color: status === 'notRead' ? '#EF4444' : status === 'needsAttention' ? '#F59E0B' : '#10B981',
              border: 'none'
            }}
          />
        </Box>
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.5)' }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Total sessions:
          </Typography>
          <Chip 
            label={student.readingSessions.length}
            size="small"
            sx={{
              height: 24,
              fontSize: '0.75rem',
              fontWeight: 700,
              borderRadius: 2,
              backgroundColor: '#E0E7FF',
              color: '#4F46E5',
              border: 'none'
            }}
          />
        </Box>
        
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block', textAlign: 'right', fontStyle: 'italic', fontWeight: 500 }}>
          {getDaysSinceReading()}
        </Typography>
      </CardContent>
    </Card>
  );
};

const PrioritizedStudentsList = ({ defaultCount = 8, filterClassId = 'all' }) => {
   const [expanded, setExpanded] = useState(true);
   const [count, setCount] = useState(defaultCount);
   const ctx = useAppContext();
   const {
      prioritizedStudents: contextPrioritizedStudents,
      updatePriorityStudentCount,
      priorityStudentCount,
      classes,
      markedPriorityStudentIds,
      markStudentAsPriorityHandled,
      resetPriorityList
    } = ctx || {};
  
   const handleStudentClick = useCallback((studentId) => {
     if (markStudentAsPriorityHandled) {
       markStudentAsPriorityHandled(studentId);
     }
   }, [markStudentAsPriorityHandled]);
 
   const handleResetList = useCallback(() => {
     if (resetPriorityList) {
       resetPriorityList();
     }
   }, [resetPriorityList]);
  
  useEffect(() => {
    setCount(priorityStudentCount);
  }, [priorityStudentCount]);
  
  const safeClasses = Array.isArray(classes) ? classes : [];
  const safeContextPrioritizedStudents = Array.isArray(contextPrioritizedStudents)
    ? contextPrioritizedStudents
    : [];

  const disabledClassIds = safeClasses.filter(cls => cls.disabled).map(cls => cls.id);

  const filteredPrioritizedStudents = safeContextPrioritizedStudents.filter(student => {
    if (student.classId && disabledClassIds.includes(student.classId)) {
      return false;
    }

    if (filterClassId === 'all') {
      return true;
    }
    if (filterClassId === 'unassigned') {
      return !student.classId;
    }
    return student.classId === filterClassId;
  });

  const allPrioritizedStudents = filteredPrioritizedStudents.slice(0, count);
  const prioritizedStudents = allPrioritizedStudents.filter(student =>
    !markedPriorityStudentIds || !markedPriorityStudentIds.has(student.id)
  );
  
  const handleCountChange = (event, newValue) => {
    setCount(newValue);
    if (typeof updatePriorityStudentCount === 'function') {
      updatePriorityStudentCount(newValue);
    } else {
      console.warn('[PrioritizedStudentsList] updatePriorityStudentCount is not a function');
    }
  };
  
  const toggleExpanded = () => {
    setExpanded(!expanded);
  };
  
  return (
    <Paper sx={{
      p: 3,
      mb: 4,
      borderRadius: '16px',
      backgroundColor: 'rgba(255, 255, 255, 0.75)',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 8px 32px rgba(160, 150, 180, 0.12), 0 2px 8px rgba(0, 0, 0, 0.04)',
      border: '1px solid rgba(255, 255, 255, 0.5)',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5" sx={{ flexGrow: 1, fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#332F3A' }}>
          Priority Reading List
        </Typography>
        <IconButton onClick={handleResetList} size="small" title="Reset List" sx={{ color: '#7C3AED', bgcolor: 'rgba(124, 58, 237, 0.1)', mr: 1, '&:hover': { bgcolor: 'rgba(124, 58, 237, 0.2)' } }}>
          <RefreshIcon />
        </IconButton>
        <IconButton onClick={toggleExpanded} size="small" title={expanded ? 'Collapse' : 'Expand'} sx={{ color: '#635F69', bgcolor: 'rgba(99, 95, 105, 0.1)', '&:hover': { bgcolor: 'rgba(99, 95, 105, 0.2)' } }}>
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ mb: 4, px: 1 }}>
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
                { value: 15, label: '15' }
              ]}
              valueLabelDisplay="auto"
              sx={{ 
                width: '100%',
                color: '#7C3AED',
                '& .MuiSlider-thumb': {
                  boxShadow: '0 4px 8px rgba(124, 58, 237, 0.4)',
                },
                '& .MuiSlider-rail': {
                  opacity: 0.3,
                }
              }}
            />
          </Box>
        </Box>
        
        <Grid container spacing={3}>
          {prioritizedStudents.map((student, index) => (
            <Grid item key={student.id} xs={12} sm={6} md={4}>
              <StudentPriorityCard
                student={student}
                priorityRank={index + 1}
                onClick={() => handleStudentClick(student.id)}
              />
            </Grid>
          ))}
        </Grid>
        
        {prioritizedStudents.length === 0 && (
          <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center', py: 4, fontStyle: 'italic' }}>
            No students available. Add students to see the priority list.
          </Typography>
        )}
      </Collapse>
    </Paper>
  );
};

export default PrioritizedStudentsList;