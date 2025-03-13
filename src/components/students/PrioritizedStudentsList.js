import React, { useState } from 'react';
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
import { useAppContext } from '../../contexts/AppContext';
import { useTheme } from '@mui/material/styles';

const StudentPriorityCard = ({ student, priorityRank }) => {
  const theme = useTheme();
  const { getReadingStatus } = useAppContext();
  
  const status = getReadingStatus(student);
  const statusColors = {
    notRead: theme.palette.status.notRead,
    needsAttention: theme.palette.status.needsAttention,
    recentlyRead: theme.palette.status.recentlyRead
  };
  
  // Get the most recent reading date from the sessions
  const getMostRecentReadDate = () => {
    if (!student.readingSessions || student.readingSessions.length === 0) {
      return null;
    }
    
    // Sort sessions by date (newest first)
    const sortedSessions = [...student.readingSessions].sort((a, b) =>
      new Date(b.date) - new Date(a.date)
    );
    
    // Return the date of the most recent session
    return sortedSessions[0].date;
  };
  
  // Get the most recent reading date
  const mostRecentReadDate = getMostRecentReadDate();
  
  // Calculate days since last reading
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
      sx={{ 
        mb: 1,
        borderLeft: `4px solid ${statusColors[status]}`,
        position: 'relative',
        overflow: 'visible'
      }}
    >
      <Box 
        sx={{ 
          position: 'absolute', 
          top: -10, 
          left: -10, 
          bgcolor: theme.palette.primary.main,
          color: 'white',
          width: 24,
          height: 24,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          fontSize: '0.8rem',
          boxShadow: 1
        }}
      >
        {priorityRank}
      </Box>
      <CardContent>
        <Typography variant="h6" component="h3" gutterBottom>
          {student.name}
        </Typography>
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
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
            color={status === 'notRead' ? 'error' : status === 'needsAttention' ? 'warning' : 'success'}
          />
        </Box>
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Total sessions:
          </Typography>
          <Chip 
            label={student.readingSessions.length}
            size="small"
            color={student.readingSessions.length === 0 ? 'error' : 'primary'}
          />
        </Box>
        
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
          {getDaysSinceReading()}
        </Typography>
      </CardContent>
    </Card>
  );
};

const PrioritizedStudentsList = ({ defaultCount = 8 }) => {
  const [expanded, setExpanded] = useState(true);
  const [count, setCount] = useState(defaultCount);
  const { getPrioritizedStudents, updatePriorityStudentCount, priorityStudentCount } = useAppContext();
  
  // Use the current priority count from context, but initialize with the prop
  React.useEffect(() => {
    setCount(priorityStudentCount);
  }, [priorityStudentCount]);
  
  const prioritizedStudents = getPrioritizedStudents(count);
  
  const handleCountChange = (event, newValue) => {
    setCount(newValue);
    updatePriorityStudentCount(newValue);
  };
  
  const toggleExpanded = () => {
    setExpanded(!expanded);
  };
  
  return (
    <Paper sx={{ p: 2, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">
          Priority Reading List
        </Typography>
        <IconButton onClick={toggleExpanded} size="small">
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>
      
      <Collapse in={expanded}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Number of students to display: {count}
          </Typography>
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
          />
        </Box>
        
        <Grid container spacing={2}>
          {prioritizedStudents.map((student, index) => (
            <Grid item xs={12} sm={6} md={4} key={student.id}>
              <StudentPriorityCard student={student} priorityRank={index + 1} />
            </Grid>
          ))}
        </Grid>
        
        {prioritizedStudents.length === 0 && (
          <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
            No students available. Add students to see the priority list.
          </Typography>
        )}
      </Collapse>
    </Paper>
  );
};

export default PrioritizedStudentsList;