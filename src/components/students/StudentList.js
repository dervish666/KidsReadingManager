import React, { useState } from 'react';
import {
  Alert, // Added Alert
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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  MenuItem // Ensure MenuItem is imported
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
    apiError, // Added apiError
    addStudent,
    studentsSortedByPriority, // Changed from getStudentsByReadingPriority
    classes // Get classes from context
  } = useAppContext();
  
  const [newStudentName, setNewStudentName] = useState('');
  const [selectedClassId, setSelectedClassId] = useState(''); // State for selected class
  const [openDialog, setOpenDialog] = useState(false);
  const [openBulkDialog, setOpenBulkDialog] = useState(false);
  const [error, setError] = useState('');
  const [sortMethod, setSortMethod] = useState('priority');
  const [sortDirection, setSortDirection] = useState('desc'); // 'asc' or 'desc'
  const [filterClassId, setFilterClassId] = useState('all'); // State for class filter ('all' or classId)

  const handleAddStudent = () => {
    if (!newStudentName.trim()) {
      setError('Please enter a student name');
      return;
    }
    
    // Pass name and selected class ID (null if 'unassigned' or empty)
    const classIdToSend = selectedClassId === 'unassigned' || selectedClassId === '' ? null : selectedClassId;
    addStudent(newStudentName.trim(), classIdToSend);
    
    setNewStudentName('');
    setSelectedClassId(''); // Reset class selection
    setOpenDialog(false);
    setError('');
  };

  const handleOpenDialog = () => {
    setNewStudentName(''); // Clear name field on open
    setSelectedClassId(''); // Clear class selection on open
    setError('');
    setOpenDialog(true);
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

  const handleFilterChange = (event) => {
    setFilterClassId(event.target.value);
  };

  // Filter and sort students
  const getFilteredAndSortedStudents = () => {
    // 1. Filter by class
    const filteredStudents = students.filter(student => {
      if (filterClassId === 'all') {
        return true; // Show all students
      }
      // Handle unassigned students if 'unassigned' is selected
      if (filterClassId === 'unassigned') {
        return !student.classId;
      }
      // Otherwise, match the classId
      return student.classId === filterClassId;
    });

    // 2. Sort the filtered list
    let sortedList;
    
    if (sortMethod === 'priority') {
      // Need to re-calculate priority based on the *filtered* list
      // This is a simplification; ideally, priority calculation considers all students.
      // For now, we'll sort the filtered list by lastReadDate as a proxy.
      // TODO: Revisit priority sorting with filtering if needed.
      sortedList = [...filteredStudents].sort((a, b) => {
         const dateA = a.lastReadDate ? new Date(a.lastReadDate) : new Date(0); // Treat null as very old
         const dateB = b.lastReadDate ? new Date(b.lastReadDate) : new Date(0);
         return dateA - dateB; // Oldest first (highest priority)
      });

      // If descending priority (ascending date) is selected, reverse
      if (sortDirection === 'asc') {
        sortedList = [...sortedList].reverse();
      }
      
      return sortedList;
    } else {
      // Sort the filtered list based on other criteria
      sortedList = [...filteredStudents].sort((a, b) => {
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
        // Reverse the comparison if ascending order is selected
        return sortDirection === 'asc' ? comparison : -comparison; // Adjusted logic for asc/desc
      });
    }
    return sortedList;
  };
  // Handle API errors first
  if (apiError) {
    // Display error message if the API call failed
    return <Alert severity="error">Error loading student data: {apiError}</Alert>;
  }


  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  const filteredAndSortedStudents = getFilteredAndSortedStudents();

  return (
    <Box>
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        mb: 3,
        flexWrap: 'wrap',
        gap: 2,
        px: { xs: 0, sm: 1 }
      }}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ mb: { xs: 0.5, sm: 0 } }}>
            Students
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {filteredAndSortedStudents.length} total
          </Typography>
        </Box>
        <Box sx={{
          display: 'flex',
          gap: 1,
          flexWrap: 'wrap',
          width: { xs: '100%', sm: 'auto' },
          justifyContent: { xs: 'stretch', sm: 'flex-end' }
        }}> {/* Allow controls to wrap */}
          {/* Class Filter Dropdown */}
          <FormControl sx={{
            minWidth: { xs: 140, sm: 180 },
            flex: { xs: 1, sm: 'none' }
          }} size="small">
            <InputLabel id="filter-class-label">Filter by Class</InputLabel>
            <Select
              labelId="filter-class-label"
              id="filter-class-select"
              value={filterClassId}
              label="Filter by Class"
              onChange={handleFilterChange}
            >
              <MenuItem value="all">All Classes</MenuItem>
              <MenuItem value="unassigned">Unassigned</MenuItem>
              {classes.map((cls) => (
                <MenuItem key={cls.id} value={cls.id}>
                  {cls.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Sort Dropdown */}
          <FormControl sx={{
            minWidth: { xs: 140, sm: 180 },
            flex: { xs: 1, sm: 'none' }
          }} size="small">
            <InputLabel id="sort-select-label">Sort By</InputLabel>
            <Select
              labelId="sort-select-label"
              id="sort-select"
              value={sortMethod}
              label="Sort By"
              onChange={handleSortChange}
              startAdornment={
                <SortIcon sx={{ mr: 1, ml: -0.5 }} fontSize="small" />
              }
              sx={{ pr: 4 }}
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
            size="small"
            sx={{
              flex: { xs: 1, sm: 'none' },
              minWidth: { xs: 'auto', sm: 120 }
            }}
          >
            <Box sx={{ display: { xs: 'none', sm: 'inline' } }}>Bulk Import</Box>
            <Box sx={{ display: { xs: 'inline', sm: 'none' } }}>Import</Box>
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
          {/* Priority Reading List - Add bottom margin */}
          <Box mb={4}> {/* Added Box wrapper with margin */}
            <PrioritizedStudentsList />
          </Box>
          
          {/* All Students Grid - Increase spacing */}
          <Grid container spacing={3}>
            {filteredAndSortedStudents.map((student) => (
              <Grid item key={student.id} xs={12} sm={6} md={4}>
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
          {/* Class Selection Dropdown */}
          <FormControl fullWidth margin="dense" sx={{ mt: 2 }}>
            <InputLabel id="add-student-class-label">Assign to Class (Optional)</InputLabel>
            <Select
              labelId="add-student-class-label"
              id="add-student-class-select"
              value={selectedClassId}
              label="Assign to Class (Optional)"
              onChange={(e) => setSelectedClassId(e.target.value)}
            >
              <MenuItem value="unassigned">
                <em>Unassigned</em>
              </MenuItem>
              {classes.map((cls) => (
                <MenuItem key={cls.id} value={cls.id}>
                  {cls.name} ({cls.teacherName})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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
        aria-label="add-student"
        sx={{
          position: 'fixed',
          bottom: {
            xs: 'calc(env(safe-area-inset-bottom) + 96px)',
            sm: 80
          },
          right: { xs: 16, sm: 24 },
          zIndex: 1200,
          width: { xs: 56, sm: 64 },
          height: { xs: 56, sm: 64 }
        }}
        onClick={handleOpenDialog}
      >
        <AddIcon />
      </Fab>
    </Box>
  );
};

export default StudentList;