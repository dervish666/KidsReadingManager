import React from 'react';
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Alert,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';

export default function NeedsAttentionTab({ students }) {
  return (
    <Box>
      <Typography
        variant="h6"
        gutterBottom
        sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}
      >
        Students Needing Attention
      </Typography>

      {students.length === 0 ? (
        <Alert severity="success" sx={{ mt: 2, borderRadius: 4 }}>
          Great job! All students have been read with recently.
        </Alert>
      ) : (
        <Paper sx={{ borderRadius: 4, overflow: 'hidden' }}>
          <List>
            {students.map((student) => (
              <ListItem key={student.id} divider>
                <ListItemIcon>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      bgcolor: 'rgba(158, 75, 75, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <PersonIcon sx={{ color: 'status.notRead' }} />
                  </Box>
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography sx={{ fontWeight: 600, fontFamily: '"DM Sans", sans-serif' }}>
                      {student.name}
                    </Typography>
                  }
                  secondary={`Last read: ${
                    student.lastReadDate
                      ? new Date(student.lastReadDate).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : 'Never'
                  }`}
                />
                <Chip
                  label="Needs Reading"
                  sx={{
                    bgcolor: 'rgba(158, 75, 75, 0.1)',
                    color: 'status.notRead',
                    fontWeight: 700,
                    borderRadius: 2,
                  }}
                  size="small"
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
}
