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
  Alert
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
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

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  const prioritizedStudents = getStudentsByReadingPriority();

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" component="h1">
          Students ({students.length})
        </Typography>
        <Button 
          variant="outlined" 
          color="primary" 
          onClick={handleOpenBulkDialog}
        >
          Bulk Import
        </Button>
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
          {prioritizedStudents.map(student => (
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