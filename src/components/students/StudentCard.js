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
  Button,
  Chip // Added Chip
} from '@mui/material';
// Removed MoreVertIcon and MenuBookIcon imports
import { useAppContext } from '../../contexts/AppContext';
import { useTheme } from '@mui/material/styles';
import StudentSessions from '../sessions/StudentSessions';

const StudentCard = ({ student }) => {
  const theme = useTheme();
  const { getReadingStatus } = useAppContext(); // Removed unused actions
  
  // Removed state for anchorEl, edit/delete/quick read dialogs, editName, assessment, notes
  const [openSessionsDialog, setOpenSessionsDialog] = useState(false);
  
  
  
  
  
  
  
  const status = getReadingStatus(student);
  const statusColors = {
    notRead: theme.palette.status.notRead,
    needsAttention: theme.palette.status.needsAttention,
    recentlyRead: theme.palette.status.recentlyRead
  };
  
  // Removed statusText as it's no longer displayed
  
  
  
  

  // Removed handlers for menu, edit, delete, quick read
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

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

  // Handle card click to open sessions dialog (simplified)
  const handleCardClick = () => {
    // Removed check for button clicks as buttons are gone
    
    
    
    setOpenSessionsDialog(true);
  };

  // Calculate days since last reading (copied from PriorityCard)
  const getDaysSinceReading = () => {
    const dateToUse = mostRecentReadDate || student.lastReadDate;
    if (!dateToUse) return 'Never read';
    
    const lastReadDate = new Date(dateToUse);
    const today = new Date();
    const diffTime = Math.abs(today - lastReadDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return `${diffDays} days ago`;
  };

  return (
    <>
      <Card
        sx={{
          height: '100%', // Keep height 100% for grid consistency
          display: 'flex',
          flexDirection: 'column',
          borderLeft: `4px solid ${statusColors[status]}`,
          // Removed transition and hover effect
          cursor: 'pointer'
        }}
        onClick={handleCardClick}
      >
        <CardContent sx={{ flexGrow: 1 }}>
          {/* Removed top Box with menu icon */}
          <Typography variant="h6" component="h2" gutterBottom>
            {student.name}
          </Typography>
          
          {/* Removed status text box */}
          
          {/* Updated Last Read and Total Sessions display */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Last read:
            </Typography>
            <Chip
              label={formatDate(mostRecentReadDate || student.lastReadDate)}
              size="small"
              color={status === 'notRead' ? 'error' : status === 'needsAttention' ? 'warning' : 'success'}
            />
          </Box>
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Total sessions:
            </Typography>
            <Chip
              label={student.readingSessions.length}
              size="small"
              color={student.readingSessions.length === 0 ? 'default' : 'primary'} // Use default if 0
            />
          </Box>
          
          {/* Added Days Since Reading */}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
            {getDaysSinceReading()}
          </Typography>
          
        </CardContent>
        
        {/* Removed bottom action bar */}
        
      </Card>

      {/* Removed Menu */}
      
      {/* Removed Edit Dialog */}
      
      {/* Removed Delete Dialog */}
      

      {/* Removed Quick Read Dialog */}
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      

      {/* Student Sessions Dialog */}
      <StudentSessions
        open={openSessionsDialog}
        onClose={() => setOpenSessionsDialog(false)}
        student={student}
      />
    </>
  );
};

export default StudentCard;