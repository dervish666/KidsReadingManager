import React, { useRef, useState, useEffect } from 'react';
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
  Grid,
  CircularProgress,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import SyncIcon from '@mui/icons-material/Sync';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';

const DataManagement = () => {
  const { fetchWithAuth, canManageUsers, user } = useAuth();
  const { exportToJson, importFromJson, reloadDataFromServer, books } = useData();
  const fileInputRef = useRef(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, file: null });
  const [clearLibraryDialog, setClearLibraryDialog] = useState(false);
  const [clearingLibrary, setClearingLibrary] = useState(false);
  const [wondeStatus, setWondeStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const isAdminOrOwner = user?.role === 'admin' || user?.role === 'owner';

  // Fetch Wonde sync status on mount for admin+ users
  useEffect(() => {
    if (!isAdminOrOwner) return;
    const fetchStatus = async () => {
      try {
        const response = await fetchWithAuth('/api/wonde/status');
        if (response.ok) {
          const data = await response.json();
          setWondeStatus(data);
        }
      } catch {
        // Wonde not configured, ignore
      }
    };
    fetchStatus();
  }, [isAdminOrOwner, fetchWithAuth]);

  const handleWondeSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const response = await fetchWithAuth('/api/wonde/sync', { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        setSyncResult(data);
        setSnackbar({
          open: true,
          message: 'School data sync completed successfully',
          severity: 'success',
        });
        // Refresh status
        const statusResponse = await fetchWithAuth('/api/wonde/status');
        if (statusResponse.ok) setWondeStatus(await statusResponse.json());
        // Reload app data to reflect synced changes
        await reloadDataFromServer();
      } else {
        setSnackbar({ open: true, message: data.error || 'Sync failed', severity: 'error' });
      }
    } catch (error) {
      setSnackbar({ open: true, message: `Sync error: ${error.message}`, severity: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const handleExport = () => {
    exportToJson();
    setSnackbar({
      open: true,
      message: 'Data exported successfully',
      severity: 'success',
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
      file,
    });
  };

  const handleImportConfirm = () => {
    const { file } = confirmDialog;

    importFromJson(file)
      .then((count) => {
        setSnackbar({
          open: true,
          message: `Successfully imported data for ${count} students`,
          severity: 'success',
        });
        setConfirmDialog({ open: false, file: null });
      })
      .catch((error) => {
        setSnackbar({
          open: true,
          message: `Import failed: ${error.message}`,
          severity: 'error',
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
          severity: 'success',
        });
      } else {
        setSnackbar({
          open: true,
          message: `Failed to reload data: ${result.error}`,
          severity: 'error',
        });
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Error reloading data: ${error.message}`,
        severity: 'error',
      });
    }
  };

  const handleClearLibrary = async () => {
    setClearingLibrary(true);
    setClearLibraryDialog(false);
    try {
      const response = await fetchWithAuth('/api/books/clear-library', { method: 'DELETE' });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'Failed to clear library');
      }
      const result = await response.json();
      await reloadDataFromServer();
      setSnackbar({
        open: true,
        message: result.message || 'Library cleared successfully',
        severity: 'success',
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Failed to clear library: ${error.message}`,
        severity: 'error',
      });
    } finally {
      setClearingLibrary(false);
    }
  };

  return (
    <Box sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        <Grid size={12}>
          <Typography variant="h6" gutterBottom>
            Data Management
          </Typography>
        </Grid>

        <Grid size={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              Data Backup & Restore
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Export your data to a JSON file for backup purposes, or restore data from a previously
              exported file. This includes all students, classes, books, genres, and reading
              sessions.
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
              <Button variant="contained" startIcon={<DownloadIcon />} onClick={handleExport}>
                Export Data
              </Button>

              <Button variant="contained" startIcon={<UploadIcon />} onClick={handleImportClick}>
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

        <Grid size={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              Server Synchronization
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Force a reload of data from the server. This is useful if you've made changes on
              another device and they aren't showing up here yet.
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
              <Button variant="outlined" color="primary" onClick={handleReloadData}>
                Reload Data from Server
              </Button>
            </Box>
          </Paper>
        </Grid>

        {isAdminOrOwner && wondeStatus?.connected && (
          <Grid size={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="subtitle1" gutterBottom>
                School Data Sync (Wonde)
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Sync students, classes, and teacher data from your school's MIS via Wonde. This runs
                automatically overnight but can be triggered manually.
              </Typography>

              {wondeStatus.lastSyncAt && (
                <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                  Last synced: {new Date(wondeStatus.lastSyncAt).toLocaleString()}
                </Typography>
              )}

              {syncResult && syncResult.status === 'completed' && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  Sync complete: {syncResult.studentsCreated} students created,{' '}
                  {syncResult.studentsUpdated} updated, {syncResult.studentsDeactivated}{' '}
                  deactivated, {syncResult.classesCreated} classes created,{' '}
                  {syncResult.classesUpdated} updated, {syncResult.employeesSynced} employees
                  synced.
                </Alert>
              )}

              <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={syncing ? <CircularProgress size={20} /> : <SyncIcon />}
                  onClick={handleWondeSync}
                  disabled={syncing}
                >
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </Button>
              </Box>
            </Paper>
          </Grid>
        )}

        {canManageUsers && (
          <Grid size={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="subtitle1" gutterBottom>
                Clear Book Library
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Remove all books from your school's library. This will unlink every book from your
                school and delete any books not used by other schools. Reading session history is
                preserved. You can reimport books afterwards.
              </Typography>

              <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={clearingLibrary ? <CircularProgress size={20} /> : <DeleteSweepIcon />}
                  onClick={() => setClearLibraryDialog(true)}
                  disabled={clearingLibrary || !books?.length}
                >
                  {clearingLibrary ? 'Clearing...' : 'Clear Library'}
                </Button>
              </Box>
            </Paper>
          </Grid>
        )}

        {/* Snackbar and Dialog remain outside the main layout Grid */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
            {snackbar.message}
          </Alert>
        </Snackbar>

        <Dialog open={confirmDialog.open} onClose={handleCloseDialog}>
          <DialogTitle>Confirm Import</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Importing this file will replace your current data. This action cannot be undone. Are
              you sure you want to continue?
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog}>Cancel</Button>
            <Button onClick={handleImportConfirm} color="primary" variant="contained">
              Import
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={clearLibraryDialog} onClose={() => setClearLibraryDialog(false)}>
          <DialogTitle>Clear Book Library</DialogTitle>
          <DialogContent>
            <DialogContentText>
              This will remove all {books?.length || 0} books from your school's library. Books not
              used by any other school will be permanently deleted. Reading session history will be
              preserved. This cannot be undone.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setClearLibraryDialog(false)}>Cancel</Button>
            <Button onClick={handleClearLibrary} color="error" variant="contained">
              Clear Library
            </Button>
          </DialogActions>
        </Dialog>
      </Grid>{' '}
      {/* Close Grid container */}
    </Box> /* Close main Box */
  );
};

export default DataManagement;
