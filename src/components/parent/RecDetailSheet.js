import React from 'react';
import { Box, Typography, Chip, Button, Dialog, DialogContent } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import BookCover from '../BookCover';
import { NUNITO, sectionTitleSx } from './parentPortalStyles';

/**
 * Book detail bottom sheet for a tapped Book Ideas recommendation:
 * cover, chips, "What it's about", "Why we suggested it", genres, where to find.
 */
const RecDetailSheet = ({ rec, onClose }) => {
  const theme = useTheme();
  const { accent, accentHover } = theme.palette.parent;
  const accentGradient = `linear-gradient(135deg, ${accent} 0%, ${accentHover} 100%)`;

  return (
    <Dialog
      open={!!rec}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-label="Book details"
      PaperProps={{
        sx: {
          position: 'fixed',
          bottom: 0,
          top: 40,
          left: 0,
          right: 0,
          m: 0,
          maxWidth: '100% !important',
          width: '100%',
          borderRadius: '16px 16px 0 0',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-end' } }}
    >
      <DialogContent sx={{ p: 2.5, overflow: 'auto' }}>
        {rec && (
          <>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <Box sx={{ flexShrink: 0 }}>
                <BookCover
                  title={rec.title}
                  author={rec.author}
                  isbn={rec.isbn}
                  width={100}
                  height={150}
                />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 800,
                    color: 'parent.accent',
                    fontFamily: NUNITO,
                    lineHeight: 1.25,
                  }}
                >
                  {rec.title}
                </Typography>
                {rec.author && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    by {rec.author}
                  </Typography>
                )}
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {rec.ageRange && (
                    <Chip
                      label={`Ages ${rec.ageRange}`}
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: '0.68rem',
                        bgcolor: alpha(accent, 0.08),
                        color: 'parent.accent',
                        fontWeight: 600,
                      }}
                    />
                  )}
                  {rec.pageCount && (
                    <Chip
                      label={`${rec.pageCount} pages`}
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: '0.68rem',
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
                        height: 22,
                        fontSize: '0.68rem',
                        bgcolor: theme.palette.accent.schoolLight,
                        color: theme.palette.accent.school,
                        fontWeight: 600,
                      }}
                    />
                  )}
                </Box>
                {rec.seriesName && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 0.75 }}
                  >
                    {rec.seriesName}
                    {rec.seriesNumber ? ` · Book ${rec.seriesNumber}` : ''}
                  </Typography>
                )}
              </Box>
            </Box>

            {rec.description && (
              <Box sx={{ mb: 2 }}>
                <Typography
                  variant="caption"
                  sx={{ ...sectionTitleSx, display: 'block', mb: 0.5, fontSize: '0.8rem' }}
                >
                  What it&apos;s about
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
                  {rec.description}
                </Typography>
              </Box>
            )}

            {rec.reason && (
              <Box sx={{ mb: 2 }}>
                <Typography
                  variant="caption"
                  sx={{ ...sectionTitleSx, display: 'block', mb: 0.5, fontSize: '0.8rem' }}
                >
                  Why we suggested it
                </Typography>
                <Box
                  sx={{
                    borderLeft: '3px solid',
                    borderColor: 'parent.accentBorder',
                    pl: 1.5,
                    py: 0.5,
                    borderRadius: '0 4px 4px 0',
                    bgcolor: alpha(accent, 0.04),
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ fontStyle: 'italic', color: 'text.secondary', lineHeight: 1.5 }}
                  >
                    {rec.reason}
                  </Typography>
                </Box>
              </Box>
            )}

            {rec.genres?.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography
                  variant="caption"
                  sx={{ ...sectionTitleSx, display: 'block', mb: 0.5, fontSize: '0.8rem' }}
                >
                  Genres
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {rec.genres.map((g, i) => (
                    <Chip
                      key={`${g}-${i}`}
                      label={g}
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: '0.68rem',
                        bgcolor: alpha(accent, 0.06),
                        color: 'text.secondary',
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}

            {rec.whereToFind && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {rec.whereToFind}
              </Typography>
            )}

            <Button
              fullWidth
              variant="contained"
              onClick={onClose}
              sx={{
                mt: 1,
                background: accentGradient,
                borderRadius: 3,
                fontWeight: 700,
                fontFamily: NUNITO,
                py: 1.25,
                '&:hover': { background: accentGradient },
              }}
            >
              Close
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RecDetailSheet;
