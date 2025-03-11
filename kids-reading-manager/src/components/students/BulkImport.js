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
  Alert
} from '@mui/material';
import { useAppContext } from '../../contexts/AppContext';

const BulkImport = ({ open, onClose }) => {
  const { bulkImportStudents, students } = useAppContext();
  const [namesText, setNamesText] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState([]);

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
    
    bulkImportStudents(names);
    setNamesText('');
    setPreview([]);
    onClose();
  };

  const handleClose = () => {
    setNamesText('');
    setPreview([]);
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Bulk Import Students</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Enter each student's name on a new line to add multiple students at once.
        </DialogContentText>
        
        {error && (
          <Alert severity="error" sx={{ mt: 2, mb: 2 }}>
            {error}
          </Alert>
        )}
        
        <TextField
          autoFocus
          margin="dense"
          label="Student Names"
          multiline
          rows={6}
          fullWidth
          value={namesText}
          onChange={handleTextChange}
          placeholder="John Smith&#10;Jane Doe&#10;Alex Johnson"
          variant="outlined"
          sx={{ mt: 2 }}
        />
        
        {preview.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Preview ({preview.length} students):
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {preview.map((name, index) => (
                <Chip key={index} label={name} size="small" />
              ))}
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button 
          onClick={handleImport} 
          variant="contained" 
          color="primary"
          disabled={preview.length === 0}
        >
          Import {preview.length > 0 ? `(${preview.length})` : ''}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BulkImport;