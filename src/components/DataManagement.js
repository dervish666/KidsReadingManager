import React, { useRef, useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Divider,
  Paper
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import SaveIcon from '@mui/icons-material/Save';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { useAppContext } from '../contexts/AppContext';

const DataManagement = () => {
  const { exportToJson, importFromJson, saveGlobalData, loadGlobalData } = useAppContext();
  const fileInputRef = useRef(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, file: null });

  const handleExport = () => {
    exportToJson();
    setSnackbar({
      open: true,
      message: 'Data exported successfully',
      severity: 'success'
    });
  };

  const handleImportClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Reset the file input
    event.target.value = null;
    
    // Show confirmation dialog
    setConfirmDialog({
      open: true,
      file
    });
  };

  const handleImportConfirm = () => {
    const { file } = confirmDialog;
    
    importFromJson(file)
      .then((count) => {
        setSnackbar({
          open: true,
          message: `Successfully imported data for ${count} students`,
          severity: 'success'
        });
        setConfirmDialog({ open: false, file: null });
      })
      .catch((error) => {
        setSnackbar({
          open: true,
          message: `Import failed: ${error.message}`,
          severity: 'error'
        });
        setConfirmDialog({ open: false, file: null });
      });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const handleCloseDialog = () => {
    setConfirmDialog({ open: false, file: null });
  };

  // Handler for saving global data
  const handleSaveGlobalData = async () => {
    try {
      const result = await saveGlobalData();
      
      if (result.success) {
        setSnackbar({
          open: true,
          message: result.fallback
            ? result.message
            : 'Data saved to global location successfully',
          severity: 'success'
        });
      } else {
        setSnackbar({
          open: true,
          message: `Failed to save global data: ${result.error}`,
          severity: 'error'
        });
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Error saving global data: ${error.message}`,
        severity: 'error'
      });
    }
  };

  // Handler for loading global data
  const handleLoadGlobalData = async () => {
    try {
      const result = await loadGlobalData();
      
      if (result.success) {
        setSnackbar({
          open: true,
          message: `Successfully loaded data for ${result.count} students`,
          severity: 'success'
        });
      } else {
        setSnackbar({
          open: true,
          message: `Failed to load global data: ${result.error}`,
          severity: 'error'
        });
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Error loading global data: ${error.message}`,
        severity: 'error'
      });
    }
  };

  return (
    <Box sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h6" gutterBottom>
        Data Management
      </Typography>
      
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Local Data Export/Import
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Export data to a file that you can save anywhere on your device, or import data from a previously exported file.
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
          >
            Export Data
          </Button>
          
          <Button
            variant="contained"
            startIcon={<UploadIcon />}
            onClick={handleImportClick}
          >
            Import Data
          </Button>
          
          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </Box>
      </Paper>
      
      <Paper sx={{ p: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Global Data Storage
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Save data to a global location that can be accessed from any device. This allows you to maintain one source of data across multiple devices.
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<SaveIcon />}
            onClick={handleSaveGlobalData}
          >
            Save to Global Location
          </Button>
          
          <Button
            variant="contained"
            color="secondary"
            startIcon={<FolderOpenIcon />}
            onClick={handleLoadGlobalData}
          >
            Load from Global Location
          </Button>
        </Box>
      </Paper>

      {/* Snackbar for notifications */}
      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleCloseSnackbar} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialog.open}
        onClose={handleCloseDialog}
      >
        <DialogTitle>Confirm Import</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Importing this file will replace your current data. This action cannot be undone.
            Are you sure you want to continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleImportConfirm} color="primary" variant="contained">
            Import
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DataManagement;