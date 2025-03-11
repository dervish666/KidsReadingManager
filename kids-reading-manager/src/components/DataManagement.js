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
  DialogActions
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import { useAppContext } from '../contexts/AppContext';

const DataManagement = () => {
  const { exportToJson, importFromJson } = useAppContext();
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

  return (
    <Box sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h6" gutterBottom>
        Data Management
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