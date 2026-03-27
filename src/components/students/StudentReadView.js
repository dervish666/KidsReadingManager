import React from 'react';
import { Box, Typography, Chip } from '@mui/material';
import { useData } from '../../contexts/DataContext';

const cardStyle = {
  bgcolor: 'rgba(250, 248, 243, 0.8)',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: '8px',
  p: 2,
  mb: 1.5,
};

const NoneSet = () => (
  <Typography variant="body2" color="text.disabled">
    None set
  </Typography>
);

const StudentReadView = ({ student, sessions }) => {
  const { genres } = useData();

  const preferences = student?.preferences || null;
  const favoriteGenreIds = preferences?.favoriteGenreIds || [];
  const likes = preferences?.likes || [];
  const dislikes = preferences?.dislikes || [];

  const hasPreferences = favoriteGenreIds.length > 0 || likes.length > 0 || dislikes.length > 0;
  const hasSessions = sessions && sessions.length > 0;

  if (!hasPreferences && !hasSessions) {
    return (
      <Box sx={cardStyle}>
        <Typography variant="body1" color="text.secondary" gutterBottom>
          No reading preferences yet
        </Typography>
        <Typography variant="body2" color="text.disabled">
          Use the Edit button to set reading preferences.
        </Typography>
      </Box>
    );
  }

  // Resolve genre names from context
  const favoriteGenres = favoriteGenreIds
    .map((id) => genres.find((g) => g.id === id))
    .filter(Boolean);

  const lastReadDate = student?.lastReadDate
    ? new Date(student.lastReadDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

  const bestStreak = student?.longestStreak ?? 0;

  return (
    <>
      {/* Genres */}
      <Box sx={cardStyle}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Favourite Genres
        </Typography>
        {favoriteGenres.length > 0 ? (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {favoriteGenres.map((genre) => (
              <Chip key={genre.id} label={genre.name} size="small" />
            ))}
          </Box>
        ) : (
          <NoneSet />
        )}
      </Box>

      {/* Likes */}
      <Box sx={cardStyle}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Likes
        </Typography>
        {likes.length > 0 ? (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {likes.map((item, index) => (
              <Chip key={index} label={item} size="small" color="success" />
            ))}
          </Box>
        ) : (
          <NoneSet />
        )}
      </Box>

      {/* Dislikes */}
      <Box sx={cardStyle}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Dislikes
        </Typography>
        {dislikes.length > 0 ? (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {dislikes.map((item, index) => (
              <Chip key={index} label={item} size="small" color="error" />
            ))}
          </Box>
        ) : (
          <NoneSet />
        )}
      </Box>

      {/* Stats */}
      <Box sx={{ ...cardStyle, mb: 0 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Reading Stats
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">
              Total sessions
            </Typography>
            <Typography variant="body2" fontWeight={500}>
              {sessions ? sessions.length : 0}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">
              Last read
            </Typography>
            <Typography variant="body2" fontWeight={500}>
              {lastReadDate}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">
              Best streak
            </Typography>
            <Typography variant="body2" fontWeight={500}>
              {bestStreak} {bestStreak === 1 ? 'day' : 'days'}
            </Typography>
          </Box>
        </Box>
      </Box>
    </>
  );
};

export default StudentReadView;
