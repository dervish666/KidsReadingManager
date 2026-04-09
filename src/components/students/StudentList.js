import React, { useState, useMemo, useEffect } from 'react';
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
  Paper,
  Pagination,
  Chip,
  InputAdornment,
  IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';
import { useTour } from '../tour/useTour';
import TourButton from '../tour/TourButton';
import StudentTable from './StudentTable';
import BulkImport from './BulkImport';
import PrioritizedStudentsList from './PrioritizedStudentsList';

const StudentList = () => {
  const { user, apiError } = useAuth();
  const { students, loading, addStudent, classes } = useData();
  const { globalClassFilter, getReadingStatus } = useUI();

  const isWondeOrg = useMemo(() => classes.some((cls) => cls.wondeClassId), [classes]);
  const canManageStudents = user?.authProvider !== 'mylogin' && !isWondeOrg;
  const { tourButtonProps } = useTour('students', { ready: students.length > 0 });

  const [newStudentName, setNewStudentName] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [openBulkDialog, setOpenBulkDialog] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const studentsPerPage = 25;

  const handleAddStudent = () => {
    if (!newStudentName.trim()) {
      setError('Please enter a student name');
      return;
    }

    const classIdToSend =
      selectedClassId === 'unassigned' || selectedClassId === '' ? null : selectedClassId;
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

  const filteredAndSortedStudents = useMemo(() => {
    const disabledClassIds = classes.filter((cls) => cls.disabled).map((cls) => cls.id);
    const query = searchQuery.trim().toLowerCase();

    const filteredStudents = students.filter((student) => {
      if (student.classId && disabledClassIds.includes(student.classId)) {
        return false;
      }

      if (globalClassFilter !== 'all') {
        if (globalClassFilter === 'unassigned') {
          if (student.classId) return false;
        } else if (student.classId !== globalClassFilter) {
          return false;
        }
      }

      if (query && !student.name.toLowerCase().includes(query)) {
        return false;
      }

      if (statusFilter !== 'all') {
        const status = getReadingStatus(student);
        if (statusFilter === 'needsAttention' && status !== 'attention') return false;
        if (statusFilter === 'notRead' && status !== 'never' && status !== 'overdue') return false;
        if (statusFilter === 'recentlyRead' && status !== 'recent') return false;
      }

      return true;
    });

    return filteredStudents;
  }, [students, classes, globalClassFilter, searchQuery, statusFilter, getReadingStatus]);

  // Reset to page 1 when filters or sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [globalClassFilter, searchQuery, statusFilter]);

  const totalPages = Math.ceil(filteredAndSortedStudents.length / studentsPerPage);

  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * studentsPerPage;
    return filteredAndSortedStudents.slice(startIndex, startIndex + studentsPerPage);
  }, [filteredAndSortedStudents, currentPage]);

  const handlePageChange = (event, newPage) => {
    setCurrentPage(newPage);
  };

  if (apiError) {
    return (
      <Alert severity="error" sx={{ borderRadius: 4 }}>
        Error loading student data: {apiError}
      </Alert>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress sx={{ color: 'primary.main' }} />
      </Box>
    );
  }

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 4,
          flexWrap: 'wrap',
          gap: 2,
          px: { xs: 0, sm: 1 },
        }}
      >
        <Box>
          <Typography
            variant="h4"
            component="h1"
            sx={{
              mb: 0.5,
              fontFamily: '"Nunito", sans-serif',
              fontWeight: 800,
              color: 'text.primary',
            }}
          >
            Students
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', fontWeight: 500 }}>
            {filteredAndSortedStudents.length > studentsPerPage
              ? `Showing ${(currentPage - 1) * studentsPerPage + 1}–${Math.min(currentPage * studentsPerPage, filteredAndSortedStudents.length)} of ${filteredAndSortedStudents.length} students`
              : `${filteredAndSortedStudents.length} total`}
          </Typography>
        </Box>
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            flexWrap: 'wrap',
            width: { xs: '100%', sm: 'auto' },
            justifyContent: { xs: 'stretch', sm: 'flex-end' },
            alignItems: 'center',
          }}
        >
          {canManageStudents && (
            <Button
              variant="outlined"
              onClick={handleOpenBulkDialog}
              size="medium"
              sx={{
                flex: { xs: 1, sm: 'none' },
                minWidth: { xs: 'auto', sm: 120 },
                borderRadius: 4,
                border: '2px solid rgba(107, 142, 107, 0.2)',
                color: 'primary.main',
                fontWeight: 700,
                '&:hover': {
                  borderWidth: '2px',
                  borderStyle: 'solid',
                  borderColor: 'primary.main',
                  backgroundColor: 'rgba(107, 142, 107, 0.05)',
                },
              }}
            >
              <Box sx={{ display: { xs: 'none', sm: 'inline' } }}>Bulk Input</Box>
              <Box sx={{ display: { xs: 'inline', sm: 'none' } }}>Input</Box>
            </Button>
          )}
          {canManageStudents && (
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
                color: 'primary.main',
                fontWeight: 700,
                '&:hover': {
                  borderWidth: '2px',
                  borderStyle: 'solid',
                  borderColor: 'primary.main',
                  backgroundColor: 'rgba(107, 142, 107, 0.05)',
                },
              }}
            >
              <Box sx={{ display: { xs: 'none', sm: 'inline' } }}>Add Student</Box>
              <Box sx={{ display: { xs: 'inline', sm: 'none' } }}>Add</Box>
            </Button>
          )}
        </Box>
      </Box>

      {students.length === 0 ? (
        <Paper
          sx={{
            textAlign: 'center',
            py: 8,
            px: 4,
            borderRadius: 8,
            backgroundColor: 'background.paper',
            border: '1px dashed rgba(107, 142, 107, 0.3)',
          }}
        >
          <Typography
            variant="h6"
            sx={{ mb: 3, color: 'text.secondary', fontFamily: '"Nunito", sans-serif' }}
          >
            {canManageStudents
              ? 'No students added yet. Add your first student to get started!'
              : 'No students found. Students are synced from your school system.'}
          </Typography>
          {canManageStudents && (
            <Button
              variant="contained"
              onClick={handleOpenDialog}
              startIcon={<AddIcon />}
              size="large"
              sx={{
                borderRadius: 4,
                background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
                boxShadow:
                  '12px 12px 24px rgba(107, 142, 107, 0.3), -8px -8px 16px rgba(255, 255, 255, 0.4)',
                fontWeight: 700,
                px: 4,
                py: 1.5,
              }}
            >
              Add Student
            </Button>
          )}
        </Paper>
      ) : (
        <>
          <Box mb={4}>
            <PrioritizedStudentsList filterClassId={globalClassFilter} />
          </Box>

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              mb: 3,
              flexWrap: 'wrap',
              px: { xs: 0, sm: 1 },
            }}
          >
            <TextField
              data-tour="students-search"
              size="small"
              placeholder="Search students..."
              aria-label="Search students"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{
                minWidth: { xs: '100%', sm: 180 },
                flex: { xs: '1 1 100%', sm: '0 1 auto' },
                '& .MuiOutlinedInput-root': {
                  borderRadius: '10px',
                  backgroundColor: '#FAF8F3',
                  boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.03)',
                  border: '1px solid rgba(139, 115, 85, 0.12)',
                  '& fieldset': { border: 'none' },
                  '&:hover': { border: '1px solid rgba(107, 142, 107, 0.3)' },
                  '&.Mui-focused': {
                    backgroundColor: '#ffffff',
                    border: '1px solid rgba(107, 142, 107, 0.5)',
                    boxShadow: '0 0 0 3px rgba(107, 142, 107, 0.12)',
                  },
                },
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: 'primary.main' }} fontSize="small" />
                    </InputAdornment>
                  ),
                  endAdornment: searchQuery ? (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        aria-label="Clear search"
                        onClick={() => setSearchQuery('')}
                        sx={{ color: 'text.secondary' }}
                      >
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                },
              }}
            />
            <Box
              data-tour="students-status-filters"
              sx={{
                display: 'flex',
                gap: 0.75,
                flexWrap: 'wrap',
                flex: { xs: '1 1 100%', sm: '1 1 auto' },
              }}
            >
              {[
                { value: 'all', label: 'All' },
                { value: 'needsAttention', label: 'Needs Attention', color: 'warning' },
                { value: 'notRead', label: 'Not Read', color: 'error' },
                { value: 'recentlyRead', label: 'Recently Read', color: 'success' },
              ].map((chip) => (
                <Chip
                  key={chip.value}
                  label={chip.label}
                  size="small"
                  color={statusFilter === chip.value ? chip.color || 'primary' : 'default'}
                  variant={statusFilter === chip.value ? 'filled' : 'outlined'}
                  onClick={() => setStatusFilter(chip.value)}
                  sx={{
                    fontWeight: 600,
                    fontFamily: '"DM Sans", sans-serif',
                    cursor: 'pointer',
                    ...(statusFilter !== chip.value && {
                      borderColor: 'rgba(107, 142, 107, 0.3)',
                      color: 'text.secondary',
                      '&:hover': {
                        borderColor: 'primary.main',
                        backgroundColor: 'rgba(107, 142, 107, 0.05)',
                      },
                    }),
                  }}
                />
              ))}
            </Box>
          </Box>

          <StudentTable students={paginatedStudents} />

          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
              <Pagination
                count={totalPages}
                page={currentPage}
                onChange={handlePageChange}
                color="primary"
                showFirstButton
                showLastButton
              />
            </Box>
          )}
        </>
      )}

      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        PaperProps={{
          sx: {
            borderRadius: 6,
            backgroundColor: 'background.paper',
            boxShadow: '0 8px 32px rgba(139, 115, 85, 0.15), 0 2px 8px rgba(0, 0, 0, 0.05)',
            p: 2,
          },
        }}
      >
        <DialogTitle
          sx={{
            fontFamily: '"Nunito", sans-serif',
            fontWeight: 800,
            fontSize: '1.5rem',
            color: 'text.primary',
          }}
        >
          Add New Student
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2, color: 'text.secondary' }}>
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
                borderRadius: '10px',
                backgroundColor: '#FAF8F3',
                boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.03)',
                border: '1px solid rgba(139, 115, 85, 0.12)',
                '& fieldset': { border: 'none' },
                '&:hover': { border: '1px solid rgba(107, 142, 107, 0.3)' },
                '&.Mui-focused': {
                  backgroundColor: '#ffffff',
                  border: '1px solid rgba(107, 142, 107, 0.5)',
                  boxShadow: '0 0 0 3px rgba(107, 142, 107, 0.12)',
                },
              },
            }}
            InputLabelProps={{
              sx: { fontFamily: '"DM Sans", sans-serif' },
            }}
          />
          <FormControl fullWidth margin="dense" sx={{ mt: 3 }}>
            <InputLabel id="add-student-class-label" sx={{ fontFamily: '"DM Sans", sans-serif' }}>
              Assign to Class (Optional)
            </InputLabel>
            <Select
              labelId="add-student-class-label"
              id="add-student-class-select"
              value={selectedClassId}
              label="Assign to Class (Optional)"
              onChange={(e) => setSelectedClassId(e.target.value)}
              sx={{
                borderRadius: '10px',
                backgroundColor: '#FAF8F3',
                boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.03)',
                border: '1px solid rgba(139, 115, 85, 0.12)',
                '& fieldset': { border: 'none' },
                '&:hover': { border: '1px solid rgba(107, 142, 107, 0.3)' },
                '&.Mui-focused': {
                  backgroundColor: '#ffffff',
                  border: '1px solid rgba(107, 142, 107, 0.5)',
                  boxShadow: '0 0 0 3px rgba(107, 142, 107, 0.12)',
                },
              }}
            >
              <MenuItem value="unassigned">
                <em>Unassigned</em>
              </MenuItem>
              {classes
                .filter((cls) => !cls.disabled)
                .map((cls) => (
                  <MenuItem key={cls.id} value={cls.id}>
                    {cls.teacherName ? `${cls.name} - ${cls.teacherName}` : cls.name}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button
            onClick={handleCloseDialog}
            sx={{ color: 'text.secondary', fontWeight: 700, mr: 1 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAddStudent}
            variant="contained"
            sx={{
              borderRadius: 3,
              background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
              boxShadow:
                '8px 8px 16px rgba(107, 142, 107, 0.3), -6px -6px 12px rgba(255, 255, 255, 0.4)',
              fontWeight: 700,
              px: 3,
            }}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>

      <BulkImport open={openBulkDialog} onClose={handleCloseBulkDialog} />

      <TourButton {...tourButtonProps} />
    </Box>
  );
};

export default StudentList;
