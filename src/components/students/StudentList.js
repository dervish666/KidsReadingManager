import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Grid,
  TextField,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Fab,
  CircularProgress,
  Divider,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SortIcon from '@mui/icons-material/Sort';
import { useAppContext } from '../../contexts/AppContext';
import StudentCard from './StudentCard';
import BulkImport from './BulkImport';

const StudentList = () => {
  const {
    students,
    loading,
    addStudent,
    getStudentsByReadingPriority
  } = useAppContext();
  
  const [newStudentName, setNewStudentName] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [openBulkDialog, setOpenBulkDialog] = useState(false);
  const [error, setError] = useState('');
  const [sortMethod, setSortMethod] = useState('priority');

  const handleAddStudent = () => {
    if (!newStudentName.trim()) {
      setError('Please enter a student name');
      return;
    }
    
    addStudent(newStudentName.trim());
    setNewStudentName('');
    setOpenDialog(false);
    setError('');
  };

  const handleOpenDialog = () => {
    setOpenDialog(true);
    setError('');
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setError('');
  };

  const handleOpenBulkDialog = () => {
    setOpenBulkDialog(true);
  };

  const handleCloseBulkDialog = () => {
    setOpenBulkDialog(false);
  };

  const handleSortChange = (event) => {
    setSortMethod(event.target.value);
  };

  // Sort students based on the selected sort method
  const getSortedStudents = () => {
    if (sortMethod === 'priority') {
      return getStudentsByReadingPriority();
    }

    return [...students].sort((a, b) => {
      switch (sortMethod) {
        case 'name':
          return a.name.localeCompare(b.name);
        
        case 'sessions':
          // Sort by total sessions (highest first)
          return b.readingSessions.length - a.readingSessions.length;
        
        case 'lastRead':
          // Handle cases where lastReadDate might be null
          if (!a.lastReadDate) return 1;
          if (!b.lastReadDate) return -1;
          // Sort by last read date (most recent first)
          return new Date(b.lastReadDate) - new Date(a.lastReadDate);
        
        default:
          return 0;
      }
    });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  const sortedStudents = getSortedStudents();

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" component="h1">
          Students ({students.length})
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl sx={{ minWidth: 150 }} size="small">
            <InputLabel id="sort-select-label">Sort By</InputLabel>
            <Select
              labelId="sort-select-label"
              id="sort-select"
              value={sortMethod}
              label="Sort By"
              onChange={handleSortChange}
              startAdornment={<SortIcon sx={{ mr: 1, ml: -0.5 }} fontSize="small" />}
            >
              <MenuItem value="priority">Reading Priority</MenuItem>
              <MenuItem value="name">Name</MenuItem>
              <MenuItem value="sessions">Total Sessions</MenuItem>
              <MenuItem value="lastRead">Last Read</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            color="primary"
            onClick={handleOpenBulkDialog}
          >
            Bulk Import
          </Button>
        </Box>
      </Box>

      {students.length === 0 ? (
        <Box sx={{ textAlign: 'center', my: 4 }}>
          <Typography variant="body1" sx={{ mb: 2 }}>
            No students added yet. Add your first student to get started!
          </Typography>
          <Button 
            variant="contained" 
            color="primary" 
            onClick={handleOpenDialog}
            startIcon={<AddIcon />}
          >
            Add Student
          </Button>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {sortedStudents.map(student => (
            <Grid item xs={12} sm={6} md={4} key={student.id}>
              <StudentCard student={student} />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Add Student Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog}>
        <DialogTitle>Add New Student</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter the student's name below:
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Student Name"
            type="text"
            fullWidth
            value={newStudentName}
            onChange={(e) => setNewStudentName(e.target.value)}
            error={!!error}
            helperText={error}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} color="primary">
            Cancel
          </Button>
          <Button onClick={handleAddStudent} color="primary" variant="contained">
            Add
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Import Dialog */}
      <BulkImport 
        open={openBulkDialog} 
        onClose={handleCloseBulkDialog} 
      />

      {/* Floating Action Button */}
      <Fab 
        color="primary" 
        aria-label="add" 
        sx={{ 
          position: 'fixed', 
          bottom: 80, 
          right: 16 
        }}
        onClick={handleOpenDialog}
      >
        <AddIcon />
      </Fab>
    </Box>
  );
};

export default StudentList;