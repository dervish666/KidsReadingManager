import React from 'react';
import { Box, Chip, Typography } from '@mui/material';
import WhatshotIcon from '@mui/icons-material/Whatshot';

/**
 * Compact inline chip bar showing student reading context:
 * [Last read: 6 days ago] [streak icon 3 day streak] [Level 2.0-4.5]
 */
const StudentInfoCard = ({ student }) => {
  if (!student) return null;

  const {
    name,
    readingLevelMin,
    readingLevelMax,
    currentStreak,
    lastReadDate,
    totalSessionCount = 0,
  } = student;

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
    if (readingLevelMin == null) return `Level \u2264${readingLevelMax}`;
    if (readingLevelMax == null) return `Level ${readingLevelMin}+`;
    return `Level ${readingLevelMin}-${readingLevelMax}`;
  };

  const levelText = formatLevel();
  const lastReadText = formatLastRead(lastReadDate);
  const hasHistory = totalSessionCount > 0;

  // Empty state: single-line italic text
  if (!hasHistory && !levelText) {
    return (
      <Box
        role="region"
        aria-label={`Reading information for ${name || 'student'}`}
        sx={{ display: 'flex', alignItems: 'center', minHeight: 32 }}
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
      sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', minHeight: 32 }}
    >
      {lastReadText && (
        <Chip label={`Last read: ${lastReadText}`} size="small" variant="outlined" />
      )}
      {currentStreak > 0 && (
        <Chip
          icon={<WhatshotIcon sx={{ fontSize: 16, color: 'accent.streak' }} />}
          label={`${currentStreak} ${currentStreak === 1 ? 'day' : 'days'} streak`}
          size="small"
          variant="outlined"
        />
      )}
      {levelText && <Chip label={levelText} size="small" variant="outlined" />}
    </Box>
  );
};

export default StudentInfoCard;
