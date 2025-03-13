import React, { useState } from 'react';
import { 
  Card, 
  CardContent, 
  Typography, 
  Box, 
  IconButton, 
  Menu,
  MenuItem,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  Button
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { useAppContext } from '../../contexts/AppContext';
import { useTheme } from '@mui/material/styles';

const StudentCard = ({ student }) => {
  const theme = useTheme();
  const { getReadingStatus, updateStudent, deleteStudent, addReadingSession } = useAppContext();
  
  const [anchorEl, setAnchorEl] = useState(null);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [openQuickReadDialog, setOpenQuickReadDialog] = useState(false);
  const [editName, setEditName] = useState(student.name);
  const [assessment, setAssessment] = useState('independent');
  const [notes, setNotes] = useState('');
  
  const status = getReadingStatus(student);
  const statusColors = {
    notRead: theme.palette.status.notRead,
    needsAttention: theme.palette.status.needsAttention,
    recentlyRead: theme.palette.status.recentlyRead
  };
  
  const statusText = {
    notRead: 'Needs Reading',
    needsAttention: 'Read Recently',
    recentlyRead: 'Up to Date'
  };

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleEditClick = () => {
    setEditName(student.name);
    setOpenEditDialog(true);
    handleMenuClose();
  };

  const handleDeleteClick = () => {
    setOpenDeleteDialog(true);
    handleMenuClose();
  };

  const handleQuickReadClick = () => {
    setAssessment('independent');
    setNotes('');
    setOpenQuickReadDialog(true);
    handleMenuClose();
  };

  const handleEditSave = () => {
    if (editName.trim()) {
      updateStudent(student.id, { name: editName.trim() });
      setOpenEditDialog(false);
    }
  };

  const handleDeleteConfirm = () => {
    deleteStudent(student.id);
    setOpenDeleteDialog(false);
  };

  const handleQuickReadSave = () => {
    addReadingSession(student.id, {
      assessment,
      notes
    });
    setOpenQuickReadDialog(false);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  // Calculate the most recent reading date from the sessions
  const getMostRecentReadDate = () => {
    if (!student.readingSessions || student.readingSessions.length === 0) {
      return null;
    }
    
    // Sort sessions by date (newest first)
    const sortedSessions = [...student.readingSessions].sort((a, b) =>
      new Date(b.date) - new Date(a.date)
    );
    
    // Return the date of the most recent session
    return sortedSessions[0].date;
  };

  // Get the most recent reading date
  const mostRecentReadDate = getMostRecentReadDate();

  return (
    <>
      <Card 
        sx={{ 
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: `4px solid ${statusColors[status]}`,
          transition: 'transform 0.2s',
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }
        }}
      >
        <CardContent sx={{ flexGrow: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Typography variant="h6" component="h2" noWrap sx={{ maxWidth: '80%' }}>
              {student.name}
            </Typography>
            <IconButton 
              aria-label="more" 
              size="small" 
              onClick={handleMenuOpen}
            >
              <MoreVertIcon />
            </IconButton>
          </Box>
          
          <Box 
            sx={{ 
              display: 'inline-block', 
              bgcolor: statusColors[status],
              color: '#fff',
              px: 1,
              py: 0.5,
              borderRadius: 1,
              fontSize: '0.75rem',
              mt: 1
            }}
          >
            {statusText[status]}
          </Box>
          
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Last read: {formatDate(mostRecentReadDate || student.lastReadDate)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total sessions: {student.readingSessions.length}
            </Typography>
          </Box>
        </CardContent>
        
        <Box 
          sx={{ 
            display: 'flex', 
            justifyContent: 'flex-end',
            p: 1,
            borderTop: `1px solid ${theme.palette.divider}`
          }}
        >
          <IconButton 
            color="primary" 
            aria-label="quick read" 
            onClick={handleQuickReadClick}
            size="small"
          >
            <MenuBookIcon />
          </IconButton>
        </Box>
      </Card>

      {/* Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleEditClick}>Edit</MenuItem>
        <MenuItem onClick={handleQuickReadClick}>Quick Read</MenuItem>
        <MenuItem onClick={handleDeleteClick} sx={{ color: 'error.main' }}>Delete</MenuItem>
      </Menu>

      {/* Edit Dialog */}
      <Dialog open={openEditDialog} onClose={() => setOpenEditDialog(false)}>
        <DialogTitle>Edit Student</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Student Name"
            type="text"
            fullWidth
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenEditDialog(false)}>Cancel</Button>
          <Button onClick={handleEditSave} variant="contained" color="primary">Save</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={openDeleteDialog} onClose={() => setOpenDeleteDialog(false)}>
        <DialogTitle>Delete Student</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete {student.name}? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDeleteDialog(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error">Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Quick Read Dialog */}
      <Dialog open={openQuickReadDialog} onClose={() => setOpenQuickReadDialog(false)}>
        <DialogTitle>Quick Reading Session</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Record a reading session for {student.name}:
          </DialogContentText>
          
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Assessment:</Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Button 
              variant={assessment === 'struggling' ? 'contained' : 'outlined'} 
              color="error"
              onClick={() => setAssessment('struggling')}
              sx={{ flex: 1 }}
            >
              Struggling
            </Button>
            <Button 
              variant={assessment === 'needs-help' ? 'contained' : 'outlined'} 
              color="warning"
              onClick={() => setAssessment('needs-help')}
              sx={{ flex: 1 }}
            >
              Needs Help
            </Button>
            <Button 
              variant={assessment === 'independent' ? 'contained' : 'outlined'} 
              color="success"
              onClick={() => setAssessment('independent')}
              sx={{ flex: 1 }}
            >
              Independent
            </Button>
          </Box>
          
          <TextField
            label="Notes (optional)"
            multiline
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenQuickReadDialog(false)}>Cancel</Button>
          <Button onClick={handleQuickReadSave} variant="contained" color="primary">Save</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default StudentCard;