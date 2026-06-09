import React, { useEffect, useState } from 'react';
import { Box, Typography, Skeleton, Chip } from '@mui/material';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import { useAuth } from '../../contexts/AuthContext';
import BookCover from '../BookCover';

const COVER_W = 60;
const COVER_H = 90;

/** A single cover with a title caption and a small stat badge overlaid. */
function BookTile({ book, badge }) {
  return (
    <Box sx={{ width: COVER_W, flexShrink: 0 }}>
      <Box sx={{ position: 'relative', width: COVER_W, height: COVER_H }}>
        <BookCover
          title={book.title}
          author={book.author}
          isbn={book.isbn}
          width={COVER_W}
          height={COVER_H}
        />
        {badge}
      </Box>
      <Typography
        variant="caption"
        noWrap
        title={book.title}
        sx={{
          display: 'block',
          mt: 0.5,
          fontWeight: 600,
          lineHeight: 1.2,
          color: 'text.secondary',
        }}
      >
        {book.title}
      </Typography>
    </Box>
  );
}

/** Heading + a horizontally scrollable row of book tiles. */
function Section({ icon, title, children }) {
  return (
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography
        variant="subtitle2"
        sx={{
          fontWeight: 700,
          mb: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          color: 'text.primary',
        }}
      >
        <span aria-hidden="true">{icon}</span>
        {title}
      </Typography>
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          overflowX: 'auto',
          pb: 1,
          // Quiet, cozy scrollbar
          '&::-webkit-scrollbar': { height: 6 },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'rgba(139, 115, 85, 0.2)',
            borderRadius: 3,
          },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

/**
 * Top Books — the first card of the Reading Noticeboard. Celebrates the
 * school's most-read and most-loved (highest star-rated) titles. Renders
 * nothing until there's something to celebrate, so a brand-new school never
 * sees an empty box.
 */
export default function TopBooksCard() {
  const { fetchWithAuth } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    // Wrap the call so a missing/misbehaving fetchWithAuth (or any synchronous
    // throw) routes to .catch instead of bubbling to the app ErrorBoundary —
    // this decorative strip must never blank the landing tab.
    Promise.resolve()
      .then(() => fetchWithAuth('/api/students/top-books'))
      .then((r) => (r && r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setData(null);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [fetchWithAuth]);

  if (loading) {
    return (
      <Box sx={cardSx}>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" width={COVER_W} height={COVER_H} />
          ))}
        </Box>
      </Box>
    );
  }

  const mostRead = data?.mostReadBooks || [];
  const mostEnjoyed = data?.mostEnjoyedBooks || [];
  if (mostRead.length === 0 && mostEnjoyed.length === 0) return null;

  return (
    <Box sx={cardSx}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: { xs: 2, md: 4 },
        }}
      >
        {mostRead.length > 0 && (
          <Section icon="📚" title="Most read">
            {mostRead.map((book) => (
              <BookTile
                key={`read-${book.title}`}
                book={book}
                badge={<Chip label={`×${book.count}`} size="small" sx={badgeSx} />}
              />
            ))}
          </Section>
        )}

        {mostEnjoyed.length > 0 && (
          <Section icon="💛" title="Most loved">
            {mostEnjoyed.map((book) => (
              <BookTile
                key={`loved-${book.title}`}
                book={book}
                badge={
                  <Chip
                    icon={<StarRoundedIcon sx={{ fontSize: 14, ml: 0.25 }} />}
                    label={book.avgRating.toFixed(1)}
                    size="small"
                    sx={badgeSx}
                  />
                }
              />
            ))}
          </Section>
        )}
      </Box>
    </Box>
  );
}

const cardSx = {
  p: { xs: 1.5, sm: 2 },
  mb: { xs: 2, sm: 2.5 },
  borderRadius: '14px',
  backgroundColor: 'rgba(107, 142, 107, 0.06)',
  border: '1px solid rgba(107, 142, 107, 0.16)',
};

const badgeSx = {
  position: 'absolute',
  top: 4,
  right: -4,
  height: 20,
  fontSize: '0.7rem',
  fontWeight: 700,
  color: '#fff',
  backgroundColor: 'rgba(74, 103, 65, 0.92)',
  boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
  '& .MuiChip-icon': { color: '#FFD54F' },
  '& .MuiChip-label': { px: 0.75 },
};
