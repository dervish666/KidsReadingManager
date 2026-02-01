import React from 'react';
import { Box, Typography } from '@mui/material';
import WhatshotIcon from '@mui/icons-material/Whatshot';

/**
 * Displays student context information: reading level, streak, last session, recent books
 */
const StudentInfoCard = ({ student }) => {
  if (!student) return null;

  const { name, readingLevelMin, readingLevelMax, currentStreak, readingSessions = [] } = student;

  // Derive last session date and recent books from sessions (already sorted DESC)
  const lastSession = readingSessions[0];
  const lastReadDate = lastSession?.date;
  const recentBooks = readingSessions
    .filter(s => s.bookTitle)
    .slice(0, 3)
    .map(s => s.bookTitle);

  // Format last read date as relative time
  const formatLastRead = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sessionDate = new Date(date);
    sessionDate.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((today - sessionDate) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 14) return '1 week ago';
    return `${Math.floor(diffDays / 7)} weeks ago`;
  };

  // Format reading level range
  const formatLevel = () => {
    if (readingLevelMin == null && readingLevelMax == null) return null;
    if (readingLevelMin === readingLevelMax) return `Level ${readingLevelMin}`;
    if (readingLevelMin == null) return `Level ≤${readingLevelMax}`;
    if (readingLevelMax == null) return `Level ${readingLevelMin}+`;
    return `Level ${readingLevelMin}-${readingLevelMax}`;
  };

  const levelText = formatLevel();
  const lastReadText = formatLastRead(lastReadDate);
  const hasHistory = readingSessions.length > 0;

  // Empty state
  if (!hasHistory && !levelText) {
    return (
      <Box
        role="region"
        aria-label={`Reading information for ${name || 'student'}`}
        sx={{
          p: 2,
          borderRadius: 4,
          backgroundColor: 'rgba(255,255,255,0.5)',
          border: '1px solid rgba(255,255,255,0.6)',
          boxShadow: 'inset 2px 2px 4px rgba(139, 115, 85, 0.1), inset -2px -2px 4px rgba(255, 255, 255, 0.8)',
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          No reading history yet
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      role="region"
      aria-label={`Reading information for ${name || 'student'}`}
      sx={{
        p: 2,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.5)',
        border: '1px solid rgba(255,255,255,0.6)',
        boxShadow: 'inset 2px 2px 4px rgba(139, 115, 85, 0.1), inset -2px -2px 4px rgba(255, 255, 255, 0.8)',
      }}
    >
      {/* Line 1: Level and Streak */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {levelText && (
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#4A4A4A' }}>
            {levelText}
          </Typography>
        )}
        {levelText && currentStreak > 0 && (
          <Typography variant="body2" color="text.secondary" aria-hidden="true">·</Typography>
        )}
        {currentStreak > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <WhatshotIcon aria-hidden="true" sx={{ fontSize: 16, color: '#F59E0B' }} />
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#F59E0B' }}>
              {currentStreak} {currentStreak === 1 ? 'day' : 'days'} reading streak
            </Typography>
          </Box>
        )}
      </Box>

      {/* Line 2: Last read date */}
      {lastReadText && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Last read: {lastReadText}
        </Typography>
      )}

      {/* Line 3+: Recent books */}
      {recentBooks.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Recent:
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2, mt: 0.5 }}>
            {recentBooks.map((title, idx) => (
              <Typography
                key={idx}
                component="li"
                variant="body2"
                sx={{ color: '#4A4A4A', fontSize: '0.85rem' }}
              >
                {title}
              </Typography>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default StudentInfoCard;
