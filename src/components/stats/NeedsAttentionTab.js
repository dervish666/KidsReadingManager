import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, Alert } from '@mui/material';
import { daysAgoLabel, formatShortDate } from '../../utils/dateLabels';

const initials = (name) =>
  (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

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
          <List disablePadding>
            {students.map((student) => (
              <ListItem key={student.id} divider sx={{ gap: 1.5, py: 1.25 }}>
                <Box
                  aria-hidden="true"
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    bgcolor: 'rgba(139, 115, 85, 0.12)',
                    color: 'secondary.dark',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    fontFamily: '"Nunito", sans-serif',
                    flexShrink: 0,
                  }}
                >
                  {initials(student.name)}
                </Box>
                <ListItemText
                  primary={
                    <Typography sx={{ fontWeight: 600, fontFamily: '"DM Sans", sans-serif' }}>
                      {student.name}
                    </Typography>
                  }
                  secondary={
                    student.lastReadDate
                      ? `Last read ${formatShortDate(student.lastReadDate)}`
                      : 'Never read'
                  }
                />
                <Typography
                  variant="body2"
                  sx={{ color: 'status.notRead', fontWeight: 700, whiteSpace: 'nowrap' }}
                >
                  {daysAgoLabel(student.lastReadDate)}
                </Typography>
              </ListItem>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
}
