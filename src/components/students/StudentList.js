import React, { useState } from 'react';
import {
  Alert,
  Box,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Paper
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SortIcon from '@mui/icons-material/Sort';
import { useAppContext } from '../../contexts/AppContext';
import StudentTable from './StudentTable';
import BulkImport from './BulkImport';
import PrioritizedStudentsList from './PrioritizedStudentsList';

const StudentList = () => {
  const {
    students,
    loading,
    apiError,
    addStudent,
    classes,
    globalClassFilter
  } = useAppContext();
  
  const [newStudentName, setNewStudentName] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [openBulkDialog, setOpenBulkDialog] = useState(false);
  const [error, setError] = useState('');
  const [sortMethod, setSortMethod] = useState('priority');
  const [sortDirection, setSortDirection] = useState('desc');

  const handleAddStudent = () => {
    if (!newStudentName.trim()) {
      setError('Please enter a student name');
      return;
    }
    
    const classIdToSend = selectedClassId === 'unassigned' || selectedClassId === '' ? null : selectedClassId;
    addStudent(newStudentName.trim(), classIdToSend);
    
    setNewStudentName('');
    setSelectedClassId('');
    setOpenDialog(false);
    setError('');
  };

  const handleOpenDialog = () => {
    setNewStudentName('');
    setSelectedClassId('');
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
    
    if (newSortMethod === sortMethod) {
      const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      setSortDirection(newDirection);
      setSortMethod(newSortMethod);
    } else {
      setSortDirection(newSortMethod === 'name' ? 'asc' : 'desc');
      setSortMethod(newSortMethod);
    }
  };

  const getFilteredAndSortedStudents = () => {
    const disabledClassIds = classes.filter(cls => cls.disabled).map(cls => cls.id);

    const filteredStudents = students.filter(student => {
      if (student.classId && disabledClassIds.includes(student.classId)) {
        return false;
      }

      if (globalClassFilter === 'all') {
        return true;
      }
      if (globalClassFilter === 'unassigned') {
        return !student.classId;
      }
      return student.classId === globalClassFilter;
    });

    let sortedList;
    
    if (sortMethod === 'priority') {
      sortedList = [...filteredStudents].sort((a, b) => {
         const dateA = a.lastReadDate ? new Date(a.lastReadDate) : new Date(0);
         const dateB = b.lastReadDate ? new Date(b.lastReadDate) : new Date(0);
         return dateA - dateB;
      });

      if (sortDirection === 'asc') {
        sortedList = [...sortedList].reverse();
      }
      
      return sortedList;
    } else {
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
          if (!a.lastReadDate) return sortDirection === 'asc' ? -1 : 1;
          if (!b.lastReadDate) return sortDirection === 'asc' ? 1 : -1;
          comparison = new Date(b.lastReadDate) - new Date(a.lastReadDate);
          break;
        
        default:
          return 0;
      }
      
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }
    return sortedList;
  };

  if (apiError) {
    return <Alert severity="error" sx={{ borderRadius: 4 }}>Error loading student data: {apiError}</Alert>;
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress sx={{ color: '#6B8E6B' }} />
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
        mb: 4,
        flexWrap: 'wrap',
        gap: 2,
        px: { xs: 0, sm: 1 }
      }}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ mb: 0.5, fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#4A4A4A' }}>
            Students
          </Typography>
          <Typography variant="body1" sx={{ color: '#7A7A7A', fontWeight: 500 }}>
            {filteredAndSortedStudents.length} total
          </Typography>
        </Box>
        <Box sx={{
          display: 'flex',
          gap: 2,
          flexWrap: 'wrap',
          width: { xs: '100%', sm: 'auto' },
          justifyContent: { xs: 'stretch', sm: 'flex-end' }
        }}>
          <FormControl sx={{
            minWidth: { xs: '100%', sm: 200 },
            flex: { xs: '1 1 100%', sm: 'none' },
            '& .MuiOutlinedInput-root': {
              borderRadius: 4,
              backgroundColor: '#ffffff',
              boxShadow: 'inset 4px 4px 8px #d9d4e3, inset -4px -4px 8px #ffffff',
              border: 'none',
              '& fieldset': { border: 'none' },
            }
          }} size="small">
            <InputLabel id="sort-select-label" sx={{ fontFamily: '"DM Sans", sans-serif' }}>Sort By</InputLabel>
            <Select
              labelId="sort-select-label"
              id="sort-select"
              value={sortMethod}
              label="Sort By"
              onChange={handleSortChange}
              startAdornment={
                <SortIcon sx={{ mr: 1, ml: -0.5, color: '#6B8E6B' }} fontSize="small" />
              }
              sx={{ pr: 4, fontFamily: '"DM Sans", sans-serif', fontWeight: 600 }}
            >
              <MenuItem value="priority">Reading Priority</MenuItem>
              <MenuItem value="name">Name</MenuItem>
              <MenuItem value="sessions">Total Sessions</MenuItem>
              <MenuItem value="lastRead">Last Read</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            onClick={handleOpenBulkDialog}
            size="medium"
            sx={{
              flex: { xs: 1, sm: 'none' },
              minWidth: { xs: 'auto', sm: 120 },
              borderRadius: 4,
              border: '2px solid rgba(107, 142, 107, 0.2)',
              color: '#6B8E6B',
              fontWeight: 700,
              '&:hover': {
                border: '2px solid #6B8E6B',
                backgroundColor: 'rgba(107, 142, 107, 0.05)',
              }
            }}
          >
            <Box sx={{ display: { xs: 'none', sm: 'inline' } }}>Bulk Input</Box>
            <Box sx={{ display: { xs: 'inline', sm: 'none' } }}>Input</Box>
          </Button>
          <Button
            variant="outlined"
            onClick={handleOpenDialog}
            size="medium"
            startIcon={<AddIcon />}
            sx={{
              flex: { xs: 1, sm: 'none' },
              minWidth: { xs: 'auto', sm: 120 },
              borderRadius: 4,
              border: '2px solid rgba(107, 142, 107, 0.2)',
              color: '#6B8E6B',
              fontWeight: 700,
              '&:hover': {
                border: '2px solid #6B8E6B',
                backgroundColor: 'rgba(107, 142, 107, 0.05)',
              }
            }}
          >
            <Box sx={{ display: { xs: 'none', sm: 'inline' } }}>Add Student</Box>
            <Box sx={{ display: { xs: 'inline', sm: 'none' } }}>Add</Box>
          </Button>
        </Box>
      </Box>

      {students.length === 0 ? (
        <Paper sx={{ 
          textAlign: 'center', 
          py: 8, 
          px: 4, 
          borderRadius: 8, 
          backgroundColor: 'rgba(255,255,255,0.5)',
          backdropFilter: 'blur(10px)',
          border: '1px dashed rgba(107, 142, 107, 0.3)'
        }}>
          <Typography variant="h6" sx={{ mb: 3, color: '#7A7A7A', fontFamily: '"Nunito", sans-serif' }}>
            No students added yet. Add your first student to get started!
          </Typography>
          <Button
            variant="contained"
            onClick={handleOpenDialog}
            startIcon={<AddIcon />}
            size="large"
            sx={{
              borderRadius: 4,
              background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
              boxShadow: '12px 12px 24px rgba(107, 142, 107, 0.3), -8px -8px 16px rgba(255, 255, 255, 0.4)',
              fontWeight: 700,
              px: 4,
              py: 1.5
            }}
          >
            Add Student
          </Button>
        </Paper>
      ) : (
        <>
          <Box mb={6}>
            <PrioritizedStudentsList filterClassId={globalClassFilter} />
          </Box>
          
          <StudentTable students={filteredAndSortedStudents} />
        </>
      )}

      <Dialog 
        open={openDialog} 
        onClose={handleCloseDialog}
        PaperProps={{
          sx: {
            borderRadius: 6,
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(20px)',
            boxShadow: '20px 20px 60px rgba(139, 115, 85, 0.4)',
            p: 2
          }
        }}
      >
        <DialogTitle sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, fontSize: '1.5rem', color: '#4A4A4A' }}>
          Add New Student
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2, color: '#7A7A7A' }}>
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
            InputProps={{
              sx: {
                borderRadius: 4,
                backgroundColor: '#EFEBF5',
                boxShadow: 'inset 4px 4px 8px #d9d4e3, inset -4px -4px 8px #ffffff',
                '& fieldset': { border: 'none' },
                '&.Mui-focused': { backgroundColor: '#ffffff', boxShadow: '0 0 0 3px rgba(107, 142, 107, 0.2)' },
              }
            }}
            InputLabelProps={{
              sx: { fontFamily: '"DM Sans", sans-serif' }
            }}
          />
          <FormControl fullWidth margin="dense" sx={{ mt: 3 }}>
            <InputLabel id="add-student-class-label" sx={{ fontFamily: '"DM Sans", sans-serif' }}>Assign to Class (Optional)</InputLabel>
            <Select
              labelId="add-student-class-label"
              id="add-student-class-select"
              value={selectedClassId}
              label="Assign to Class (Optional)"
              onChange={(e) => setSelectedClassId(e.target.value)}
              sx={{
                borderRadius: 4,
                backgroundColor: '#EFEBF5',
                boxShadow: 'inset 4px 4px 8px #d9d4e3, inset -4px -4px 8px #ffffff',
                '& fieldset': { border: 'none' },
                '&.Mui-focused': { backgroundColor: '#ffffff', boxShadow: '0 0 0 3px rgba(107, 142, 107, 0.2)' },
              }}
            >
              <MenuItem value="unassigned">
                <em>Unassigned</em>
              </MenuItem>
              {classes.filter(cls => !cls.disabled).map((cls) => (
                <MenuItem key={cls.id} value={cls.id}>
                  {cls.teacherName ? `${cls.name} - ${cls.teacherName}` : cls.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={handleCloseDialog} sx={{ color: '#7A7A7A', fontWeight: 700, mr: 1 }}>
            Cancel
          </Button>
          <Button 
            onClick={handleAddStudent} 
            variant="contained"
            sx={{
              borderRadius: 3,
              background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
              boxShadow: '8px 8px 16px rgba(107, 142, 107, 0.3), -6px -6px 12px rgba(255, 255, 255, 0.4)',
              fontWeight: 700,
              px: 3
            }}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>

      <BulkImport 
        open={openBulkDialog} 
        onClose={handleCloseBulkDialog} 
      />

    </Box>
  );
};

export default StudentList;