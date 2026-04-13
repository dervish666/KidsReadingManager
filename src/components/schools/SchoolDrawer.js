import React, { useState } from 'react';
import {
  Box,
  Typography,
  Drawer,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Alert,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import SchoolReadView from './SchoolReadView';
import SchoolEditForm from './SchoolEditForm';

const SchoolDrawer = ({
  open,
  school,
  mode,
  loading,
  onClose,
  onEdit,
  onSave,
  onCancel,
  onSync,
  onStartTrial,
  onOpenPortal,
  onDeactivate,
  onToggleAi,
}) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleDeactivateClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleConfirmDeactivate = () => {
    onDeactivate();
    setDeleteDialogOpen(false);
  };

  const title = mode === 'add' ? 'Add School' : school?.name || '';

  return (
    <>
      <Drawer
        anchor="right"
        variant="temporary"
        open={open}
        onClose={onClose}
        PaperProps={{ sx: { width: { xs: '100%', sm: 420 } } }}
      >
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            p: 2,
            pb: 0,
          }}
        >
          <Typography variant="h6" noWrap sx={{ flex: 1, mr: 1 }}>
            {title}
          </Typography>
          <IconButton onClick={onClose} aria-label="Close drawer">
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Content */}
        <Box sx={{ p: 2, overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {mode === 'read' && (
            <SchoolReadView
              school={school}
              onEdit={onEdit}
              onSync={onSync}
              onStartTrial={onStartTrial}
              onOpenPortal={onOpenPortal}
              onDeactivate={handleDeactivateClick}
              onToggleAi={onToggleAi}
              loading={loading}
            />
          )}
          {(mode === 'edit' || mode === 'add') && (
            <SchoolEditForm
              school={mode === 'edit' ? school : null}
              onSave={onSave}
              onCancel={onCancel}
              loading={loading}
            />
          )}
        </Box>
      </Drawer>

      {/* Deactivate confirmation dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirm Deactivation</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to deactivate {school?.name}? This will deactivate the school but
            not delete associated data.
          </DialogContentText>
          {school?.wondeSchoolId && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              This school is managed by Wonde. It may be re-provisioned automatically if a new
              webhook is received. Consider revoking access in the Wonde dashboard first.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmDeactivate} color="error">
            Deactivate
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default SchoolDrawer;
