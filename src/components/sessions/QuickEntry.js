import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Button,
  Chip,
  Snackbar,
  Alert,
  CircularProgress,
  SwipeableDrawer,
  TextField,
  Slider,
  IconButton
} from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TuneIcon from '@mui/icons-material/Tune';
import { useAppContext } from '../../contexts/AppContext';
import AssessmentSelector from './AssessmentSelector';
import { useTheme } from '@mui/material/styles';

const QuickEntry = () => {
  const theme = useTheme();
  const {
    getPrioritizedStudents,
    getReadingStatus,
    addReadingSession,
    priorityStudentCount,
    updatePriorityStudentCount
  } = useAppContext();
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [assessment, setAssessment] = useState('independent');
  const [notes, setNotes] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [notesDrawerOpen, setNotesDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [completedStudents, setCompletedStudents] = useState([]);
  const [count, setCount] = useState(priorityStudentCount);
  
  // Get students sorted by priority using the enhanced algorithm
  const prioritizedStudents = getPrioritizedStudents(count);
  
  // Reset current index if we have no students
  useEffect(() => {
    if (prioritizedStudents.length === 0) {
      setCurrentIndex(0);
    } else if (currentIndex >= prioritizedStudents.length) {
      setCurrentIndex(prioritizedStudents.length - 1);
    }
  }, [prioritizedStudents.length, currentIndex]);
  
  const currentStudent = prioritizedStudents[currentIndex];
  
  const handleNext = () => {
    if (currentIndex < prioritizedStudents.length - 1) {
      setCurrentIndex(currentIndex + 1);
      // Reset assessment and notes for the next student
      setAssessment('independent');
      setNotes('');
    }
  };
  
  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      // Reset assessment and notes for the previous student
      setAssessment('independent');
      setNotes('');
    }
  };
  
  const handleAssessmentChange = (newAssessment) => {
    setAssessment(newAssessment);
  };
  
  const handleNotesChange = (event) => {
    setNotes(event.target.value);
  };
  
  const handleSave = () => {
    if (!currentStudent) return;
    
    addReadingSession(currentStudent.id, {
      assessment,
      notes
    });
    
    // Add to completed students list
    setCompletedStudents([...completedStudents, currentStudent.id]);
    
    // Show success message
    setSnackbarMessage(`Reading session saved for ${currentStudent.name}`);
    setSnackbarOpen(true);
    
    // Move to next student automatically
    if (currentIndex < prioritizedStudents.length - 1) {
      handleNext();
    }
  };
  
  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };
  
  const toggleNotesDrawer = () => {
    setNotesDrawerOpen(!notesDrawerOpen);
  };
  
  const toggleSettingsDrawer = () => {
    setSettingsOpen(!settingsOpen);
  };
  
  const handleCountChange = (event, newValue) => {
    setCount(newValue);
    updatePriorityStudentCount(newValue);
  };
  
  const isCompleted = (studentId) => {
    return completedStudents.includes(studentId);
  };
  
  if (prioritizedStudents.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6" gutterBottom>
          No students available
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Add students first to use the quick entry mode.
        </Typography>
      </Paper>
    );
  }
  
  if (!currentStudent) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }
  
  const status = getReadingStatus(currentStudent);
  const statusColors = {
    notRead: theme.palette.status.notRead,
    needsAttention: theme.palette.status.needsAttention,
    recentlyRead: theme.palette.status.recentlyRead
  };
  
  return (
    <Box>
      <Paper sx={{ p: 3, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Student {currentIndex + 1} of {prioritizedStudents.length}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <IconButton
            size="small"
            onClick={toggleSettingsDrawer}
            sx={{ mr: 1 }}
            color="primary"
          >
            <TuneIcon />
          </IconButton>
          <Chip
            label={`${completedStudents.length} Completed`}
            color="primary"
            size="small"
            icon={<CheckCircleIcon />}
          />
        </Box>
        
        <Card 
          sx={{ 
            mb: 3,
            borderLeft: `4px solid ${statusColors[status]}`,
          }}
        >
          <CardContent>
            <Typography variant="h5" component="h2" gutterBottom>
              {currentStudent.name}
            </Typography>
            
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Last read: {currentStudent.lastReadDate 
                ? new Date(currentStudent.lastReadDate).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  }) 
                : 'Never'}
            </Typography>
            
            <Typography variant="body2" color="text.secondary">
              Total sessions: {currentStudent.readingSessions.length}
            </Typography>
          </CardContent>
          
          {isCompleted(currentStudent.id) && (
            <Box sx={{ bgcolor: 'success.light', p: 1, textAlign: 'center' }}>
              <Typography variant="body2" color="white">
                Reading session recorded today
              </Typography>
            </Box>
          )}
        </Card>
        
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            Assessment:
          </Typography>
          <AssessmentSelector
            value={assessment}
            onChange={handleAssessmentChange}
          />
        </Box>
        
        <Button
          variant="outlined"
          fullWidth
          onClick={toggleNotesDrawer}
          sx={{ mb: 3 }}
        >
          {notes ? 'Edit Notes' : 'Add Notes'}
        </Button>
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button
            variant="outlined"
            startIcon={<NavigateBeforeIcon />}
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            sx={{ flexBasis: '30%' }}
          >
            Previous
          </Button>
          
          <Button
            variant="contained"
            color="primary"
            onClick={handleSave}
            disabled={isCompleted(currentStudent.id)}
            sx={{ flexBasis: '35%' }}
          >
            {isCompleted(currentStudent.id) ? 'Recorded' : 'Save'}
          </Button>
          
          <Button
            variant="outlined"
            endIcon={<NavigateNextIcon />}
            onClick={handleNext}
            disabled={currentIndex === prioritizedStudents.length - 1}
            sx={{ flexBasis: '30%' }}
          >
            Next
          </Button>
        </Box>
      </Paper>
      
      <SwipeableDrawer
        anchor="bottom"
        open={notesDrawerOpen}
        onClose={() => setNotesDrawerOpen(false)}
        onOpen={() => setNotesDrawerOpen(true)}
        disableSwipeToOpen={false}
        swipeAreaWidth={30}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Notes for {currentStudent.name}
          </Typography>
          <TextField
            multiline
            rows={6}
            value={notes}
            onChange={handleNotesChange}
            placeholder="Enter notes about the reading session here..."
            fullWidth
            variant="outlined"
            sx={{ mb: 2 }}
          />
          <Button 
            variant="contained" 
            onClick={toggleNotesDrawer}
            fullWidth
          >
            Done
          </Button>
        </Box>
      </SwipeableDrawer>
      
      {/* Settings Drawer */}
      <SwipeableDrawer
        anchor="bottom"
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpen={() => setSettingsOpen(true)}
        disableSwipeToOpen={false}
        swipeAreaWidth={30}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Priority Settings
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Number of students to include: {count}
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
            sx={{ mb: 3 }}
          />
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Students are prioritized by:
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            1. Those who haven't been read with for the longest time
          </Typography>
          <Typography variant="body2" sx={{ mb: 3 }}>
            2. Those who have been read with the least number of times
          </Typography>
          <Button
            variant="contained"
            onClick={toggleSettingsDrawer}
            fullWidth
          >
            Done
          </Button>
        </Box>
      </SwipeableDrawer>
      
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2000}
        onClose={handleSnackbarClose}
      >
        <Alert onClose={handleSnackbarClose} severity="success" sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default QuickEntry;