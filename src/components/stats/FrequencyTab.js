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
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import ReadingFrequencyChart from './ReadingFrequencyChart';

export default function FrequencyTab({ students }) {
  return (
    <Box>
      {/* Bar Chart Visualization */}
      <ReadingFrequencyChart />

      {/* List View */}
      <Typography
        variant="h6"
        gutterBottom
        sx={{ mt: 4, fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}
      >
        Reading Frequency Details
      </Typography>

      <Paper sx={{ borderRadius: 4, overflow: 'hidden' }}>
        <List>
          {students.map((student) => {
            const sessionCount = student.totalSessionCount || 0;
            return (
              <ListItem key={student.id} divider>
                <ListItemIcon>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      bgcolor: 'rgba(107, 142, 107, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <PersonIcon sx={{ color: 'primary.main' }} />
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
                  label={`${sessionCount} sessions`}
                  sx={{
                    bgcolor:
                      sessionCount === 0 ? 'rgba(158, 75, 75, 0.1)' : 'rgba(107, 142, 107, 0.12)',
                    color: sessionCount === 0 ? 'status.notRead' : 'primary.dark',
                    fontWeight: 700,
                    borderRadius: 2,
                  }}
                  size="small"
                />
              </ListItem>
            );
          })}
        </List>
      </Paper>
    </Box>
  );
}
