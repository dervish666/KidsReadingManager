import React from 'react';
import { Box, Typography } from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';

/**
 * Generate a consistent color from a string
 * Same title will always generate the same color
 */
const generateColorFromString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Generate hue from hash (0-360)
  const hue = Math.abs(hash % 360);
  // Use fixed saturation and lightness for pleasant colors
  const saturation = 45;
  const lightness = 35;

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

/**
 * BookCoverPlaceholder - A fallback component for books without cover images
 *
 * Props:
 * - title (string): The book title to display
 * - width (number): Width in pixels (default: 80)
 * - height (number): Height in pixels (default: 120)
 */
const BookCoverPlaceholder = ({ title, width = 80, height = 120 }) => {
  const backgroundColor = generateColorFromString(title || '');

  return (
    <Box
      data-testid="placeholder-bg"
      sx={{
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor,
        borderRadius: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 1,
        boxSizing: 'border-box',
      }}
      style={{ backgroundColor }}
    >
      <MenuBookIcon
        data-testid="book-icon"
        sx={{
          color: 'rgba(255, 255, 255, 0.8)',
          fontSize: Math.min(width, height) * 0.35,
          marginBottom: 0.5,
        }}
      />
      <Typography
        variant="caption"
        sx={{
          color: 'rgba(255, 255, 255, 0.9)',
          textAlign: 'center',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          lineHeight: 1.2,
          fontSize: Math.max(8, Math.min(width * 0.12, 12)),
          wordBreak: 'break-word',
        }}
      >
        {title}
      </Typography>
    </Box>
  );
};

export default BookCoverPlaceholder;
