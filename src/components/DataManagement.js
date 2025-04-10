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
  Paper,
  Grid // Import Grid
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
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
      <Grid container spacing={3}> {/* Add Grid container */}
        <Grid item xs={12} sx={{ mb: 3 }}> {/* Wrap title in Grid item */}
          <Typography variant="h6" gutterBottom>
            Data Management
          </Typography>
        </Grid> {/* Close Grid item for title */}
      {/* Remove extraneous Typography closing tag */}
        <Grid item xs={12}> {/* Wrap first Paper in Grid item */}
          <Paper sx={{ p: 3 }}> {/* Remove mb from Paper, handled by Grid spacing */}
        <Typography variant="subtitle1" gutterBottom>
          Cloud Data Export/Import
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Export data from the cloud to a file that you can save anywhere on your device, or import data from a previously exported file to the cloud.
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
      </Grid>
      
      <Grid item xs={12}> {/* Wrap second Paper in Grid item */}
        <Paper sx={{ p: 3 }}> {/* Remove mb from Paper */}
        <Typography variant="subtitle1" gutterBottom>
          Cloud Data Management
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Reload data from the Cloudflare Workers API to ensure you have the latest information, especially when accessing from multiple devices.
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
      </Grid>
      
      <Grid item xs={12}> {/* Wrap third Paper in Grid item */}
        <Paper sx={{ p: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Cloud Backup and Restore
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Create backups of your cloud data or restore from previously saved backups to the cloud.
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
      </Grid> {/* Close Grid item for third Paper */}

      {/* Snackbar and Dialog remain outside the main layout Grid */}
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
    </Grid> {/* Close Grid container */}
  </Box> /* Close main Box */
  );
};

export default DataManagement;