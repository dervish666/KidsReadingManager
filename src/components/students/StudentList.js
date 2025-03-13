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
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { useAppContext } from '../../contexts/AppContext';
import StudentCard from './StudentCard';
import BulkImport from './BulkImport';
import PrioritizedStudentsList from './PrioritizedStudentsList';

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
  const [sortDirection, setSortDirection] = useState('desc'); // 'asc' or 'desc'

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
    const newSortMethod = event.target.value;
    
    // If selecting the same method, toggle the sort direction
    if (newSortMethod === sortMethod) {
      // Toggle the direction
      const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      setSortDirection(newDirection);
      
      // Force a re-render by setting the sort method again
      // This ensures the list updates when toggling direction
      setSortMethod(newSortMethod);
    } else {
      // For new sort method, set default direction
      // Default to ascending for name, descending for others
      setSortDirection(newSortMethod === 'name' ? 'asc' : 'desc');
      setSortMethod(newSortMethod);
    }
  };

  // Sort students based on the selected sort method and direction
  const getSortedStudents = () => {
    // Get the base sorted list
    let sortedList;
    
    if (sortMethod === 'priority') {
      // Get the priority-sorted list from context
      sortedList = getStudentsByReadingPriority();
      
      // If ascending is selected, reverse the priority order
      if (sortDirection === 'asc') {
        sortedList = [...sortedList].reverse();
      }
      
      return sortedList;
    }

    return [...students].sort((a, b) => {
      let comparison = 0;
      
      switch (sortMethod) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        
        case 'sessions':
          comparison = b.readingSessions.length - a.readingSessions.length;
          break;
        
        case 'lastRead':
          // Handle cases where lastReadDate might be null
          if (!a.lastReadDate) return sortDirection === 'asc' ? -1 : 1;
          if (!b.lastReadDate) return sortDirection === 'asc' ? 1 : -1;
          comparison = new Date(b.lastReadDate) - new Date(a.lastReadDate);
          break;
        
        default:
          return 0;
      }
      
      // Reverse the comparison if ascending order is selected
      return sortDirection === 'asc' ? -comparison : comparison;
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
              startAdornment={
                <>
                  <SortIcon sx={{ mr: 0.5, ml: -0.5 }} fontSize="small" />
                  {sortDirection === 'asc' ? (
                    <ArrowUpwardIcon fontSize="small" sx={{ mr: 0.5 }} />
                  ) : (
                    <ArrowDownwardIcon fontSize="small" sx={{ mr: 0.5 }} />
                  )}
                </>
              }
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
        <>
          {/* Priority Reading List */}
          <PrioritizedStudentsList />
          
          {/* All Students Grid */}
          <Grid container spacing={2}>
            {sortedStudents.map(student => (
              <Grid item xs={12} sm={6} md={4} key={student.id}>
                <StudentCard student={student} />
              </Grid>
            ))}
          </Grid>
        </>
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