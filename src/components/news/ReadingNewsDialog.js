import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Link,
  Chip,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';

// Soft, warm tints per news kind — keeps the newsletter scannable without
// shouting. Unknown kinds fall back to the neutral sage.
const KIND_LABEL = {
  release: 'New release',
  news: 'News',
  award: 'Award',
  spotlight: 'Spotlight',
};
const KIND_COLOR = {
  release: 'rgba(74, 103, 65, 0.12)',
  news: 'rgba(139, 115, 85, 0.12)',
  award: 'rgba(193, 154, 64, 0.16)',
  spotlight: 'rgba(107, 142, 107, 0.12)',
};

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

/**
 * The full Reading News "newsletter" — opened from the ticker. Presentational:
 * it renders whatever the ticker fetched from `/reading-news.json`.
 */
export default function ReadingNewsDialog({ open, data, onClose }) {
  const items = data?.items || [];
  const updated = data?.generatedAt ? formatDate(data.generatedAt) : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: '16px', backgroundColor: 'background.paper' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="h6"
            sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: 'text.primary' }}
          >
            {data?.title || 'Reading News'}
          </Typography>
          {data?.intro && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              {data.intro}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} aria-label="Close" size="small" sx={{ mt: 0.5 }}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.map((item) => (
            <Box
              key={item.id}
              sx={{
                p: 2,
                borderRadius: '12px',
                backgroundColor: 'rgba(139, 115, 85, 0.04)',
                border: '1px solid rgba(139, 115, 85, 0.1)',
              }}
            >
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}
              >
                {item.kind && (
                  <Chip
                    label={KIND_LABEL[item.kind] || item.kind}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      backgroundColor: KIND_COLOR[item.kind] || KIND_COLOR.spotlight,
                      color: 'text.primary',
                    }}
                  />
                )}
                {(item.author || item.book) && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    {[item.author, item.book].filter(Boolean).join(' · ')}
                  </Typography>
                )}
              </Box>
              <Typography sx={{ fontWeight: 700, color: 'text.primary', lineHeight: 1.3 }}>
                {item.headline}
              </Typography>
              {item.summary && (
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.75 }}>
                  {item.summary}
                </Typography>
              )}
              {item.link ? (
                <Link
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    mt: 1,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}
                >
                  {item.source || 'Read more'}
                  <OpenInNewRoundedIcon sx={{ fontSize: 14 }} />
                </Link>
              ) : (
                item.source && (
                  <Typography
                    variant="caption"
                    sx={{ display: 'block', mt: 1, color: 'text.disabled' }}
                  >
                    Source: {item.source}
                  </Typography>
                )
              )}
            </Box>
          ))}
        </Box>

        {updated && (
          <Typography
            variant="caption"
            sx={{ display: 'block', mt: 2, textAlign: 'center', color: 'text.disabled' }}
          >
            Updated {updated}
          </Typography>
        )}
      </DialogContent>
    </Dialog>
  );
}
