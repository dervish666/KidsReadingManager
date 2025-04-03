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
  Paper
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import SaveIcon from '@mui/icons-material/Save';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { useAppContext } from '../contexts/AppContext';

const DataManagement = () => {
  const { exportToJson, importFromJson, reloadDataFromServer } = useAppContext();
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

  // Handler for reloading data from server
  const handleReloadData = async () => {
    try {
      const result = await reloadDataFromServer();
      
      if (result.success) {
        setSnackbar({
          open: true,
          message: 'Data reloaded successfully from server',
          severity: 'success'
        });
      } else {
        setSnackbar({
          open: true,
          message: `Failed to reload data: ${result.error}`,
          severity: 'error'
        });
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Error reloading data: ${error.message}`,
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
      
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Server Data Management
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Reload data from the server to ensure you have the latest information, especially when accessing from multiple devices.
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleReloadData}
          >
            Reload Data from Server
          </Button>
        </Box>
      </Paper>
      
      <Paper sx={{ p: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Backup and Restore
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Create backups of your data or restore from previously saved backups.
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
          >
            Download Backup (JSON)
          </Button>
          
          <Button
            variant="contained"
            color="secondary"
            startIcon={<UploadIcon />}
            onClick={handleImportClick}
          >
            Upload Backup (JSON)
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