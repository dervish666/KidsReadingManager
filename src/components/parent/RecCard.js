import React from 'react';
import { Box, Typography, Paper, Chip } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import BookCover from '../BookCover';
import { tappableCardSx } from './parentPortalStyles';

/**
 * Book Ideas card (shared by the AI + library sections of the parent portal).
 * Tappable → detail sheet. Card blurb prefers the description ("what it's
 * about") and falls back to the reason ("why we suggested it").
 */
const RecCard = ({ rec, onClick }) => {
  const theme = useTheme();
  const { accent } = theme.palette.parent;
  const blurb = rec.description || rec.reason;

  return (
    <Paper
      component="button"
      onClick={onClick}
      elevation={0}
      sx={{
        ...tappableCardSx,
        alignItems: 'flex-start',
        gap: 1.5,
        p: 1.5,
        borderRadius: 3,
        border: `1px solid ${alpha(accent, 0.15)}`,
        bgcolor: 'white',
        transition: 'box-shadow 0.2s ease',
        '&:hover': { boxShadow: `0 4px 16px ${alpha(accent, 0.12)}` },
      }}
    >
      <Box sx={{ flexShrink: 0 }}>
        <BookCover title={rec.title} author={rec.author} isbn={rec.isbn} width={56} height={84} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: 700, color: 'parent.accent', lineHeight: 1.3 }}
        >
          {rec.title}
        </Typography>
        {rec.author && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            by {rec.author}
          </Typography>
        )}
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: blurb ? 0.75 : 0 }}>
          {rec.ageRange && (
            <Chip
              label={`Ages ${rec.ageRange}`}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.65rem',
                bgcolor: alpha(accent, 0.08),
                color: 'parent.accent',
                fontWeight: 600,
              }}
            />
          )}
          {rec.inLibrary && (
            <Chip
              label="✓ In school library"
              size="small"
              sx={{
                height: 20,
                fontSize: '0.65rem',
                bgcolor: theme.palette.accent.schoolLight,
                color: theme.palette.accent.school,
                fontWeight: 600,
              }}
            />
          )}
        </Box>
        {blurb && (
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              fontSize: '0.85rem',
              lineHeight: 1.4,
              fontStyle: rec.description ? 'normal' : 'italic',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {blurb}
          </Typography>
        )}
        <Typography
          variant="caption"
          sx={{ color: 'parent.accentHover', fontWeight: 600, display: 'block', mt: 0.5 }}
        >
          More about this book →
        </Typography>
      </Box>
    </Paper>
  );
};

export default RecCard;
