import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Chip,
  Alert,
  Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useAppContext } from '../../contexts/AppContext';

const BulkImport = ({ open, onClose }) => {
   const { bulkImportStudents, students, classes } = useAppContext();
   const theme = useTheme();
   const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
   const [namesText, setNamesText] = useState('');
   const [error, setError] = useState('');
   const [preview, setPreview] = useState([]);
   const [selectedClassId, setSelectedClassId] = useState('');

  const handleTextChange = (e) => {
    const text = e.target.value;
    setNamesText(text);
    
    // Generate preview
    if (text.trim()) {
      const names = text
        .split('\n')
        .map(name => name.trim())
        .filter(name => name);
      setPreview(names);
    } else {
      setPreview([]);
    }
    
    // Clear error when user types
    if (error) setError('');
  };

  const handleImport = () => {
    if (!namesText.trim()) {
      setError('Please enter at least one student name');
      return;
    }
    
    const names = namesText
      .split('\n')
      .map(name => name.trim())
      .filter(name => name);
    
    if (names.length === 0) {
      setError('Please enter at least one valid student name');
      return;
    }
    
    // Check for duplicates with existing students
    const existingNames = students.map(s => s.name.toLowerCase());
    const duplicates = names.filter(name => 
      existingNames.includes(name.toLowerCase())
    );
    
    if (duplicates.length > 0) {
      setError(`Some students already exist: ${duplicates.join(', ')}`);
      return;
    }
    
    bulkImportStudents(names, selectedClassId || null);
    setNamesText('');
    setPreview([]);
    setSelectedClassId('');
    onClose();
  };

  const handleClose = () => {
    setNamesText('');
    setPreview([]);
    setError('');
    setSelectedClassId('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullScreen={fullScreen} maxWidth="sm" fullWidth>
      <DialogTitle>Bulk Input Students</DialogTitle>
      <DialogContent>
        {/* Wrap content in Grid container */}
        <Grid container spacing={3} sx={{ pt: 1, pb: 'calc(env(safe-area-inset-bottom) + 16px)' }}> {/* Add some padding top */}
          <Grid size={12}>
            <DialogContentText>
              Enter each student's name on a new line to add multiple students at once.
            </DialogContentText>
          </Grid>

          <Grid size={12}>
            <FormControl fullWidth>
              <InputLabel>Class (Optional)</InputLabel>
              <Select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                label="Class (Optional)"
              >
                <MenuItem value="">
                  <em>No class assigned</em>
                </MenuItem>
                {classes.map((cls) => (
                  <MenuItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          
          {error && (
            <Grid size={12}> {/* Wrap Alert in Grid item */}
              <Alert severity="error"> {/* Remove sx margins, rely on Grid spacing */}
                {error}
              </Alert>
            </Grid>
          )}
          
          <Grid size={12}> {/* Wrap TextField in Grid item */}
            <TextField
              autoFocus
              // margin="dense" // Remove margin, rely on Grid spacing
              label="Student Names"
              multiline
              rows={6}
              fullWidth
              value={namesText}
              onChange={handleTextChange}
              placeholder="John Smith&#10;Jane Doe&#10;Alex Johnson"
              variant="outlined"
              // sx={{ mt: 2 }} // Remove sx margin, rely on Grid spacing
            />
          </Grid>
          
          {preview.length > 0 && (
            <Grid size={12}> {/* Wrap Preview Box in Grid item */}
              <Box> {/* Remove sx margin, rely on Grid spacing */}
                <Typography variant="subtitle2" gutterBottom>
                  Preview ({preview.length} students):
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {preview.map((name, index) => (
                    <Chip key={index} label={name} size="small" />
                  ))}
                </Box>
              </Box>
            </Grid>
          )}
        </Grid>
      </DialogContent>
      <DialogActions sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' }, px: 2, pb: 'calc(env(safe-area-inset-bottom) + 8px)' }}>
        <Button onClick={handleClose} fullWidth>
          Cancel
        </Button>
        <Button
          onClick={handleImport}
          variant="contained"
          color="primary"
          disabled={preview.length === 0}
          fullWidth
        >
          Input {preview.length > 0 ? `(${preview.length})` : ''}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BulkImport;