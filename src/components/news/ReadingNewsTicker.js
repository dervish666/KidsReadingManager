import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Fade } from '@mui/material';
import AutoStoriesRoundedIcon from '@mui/icons-material/AutoStoriesRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ReadingNewsDialog from './ReadingNewsDialog';

const ROTATE_MS = 6000;

/**
 * Reading News ticker — a quiet, warm bar at the top of the Stats page that
 * rotates through the latest reading-news headlines and opens the full
 * newsletter on click. Fed by the static `/reading-news.json` published into
 * the repo (hand-seeded for now; generated weekly by the reading-news skill
 * later). Renders nothing if the file is missing, empty, or malformed, so a
 * broken feed never leaves an empty bar.
 */
export default function ReadingNewsTicker() {
  const [data, setData] = useState(null);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [paused, setPaused] = useState(false);

  const reduceMotion = useMemo(() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    // Plain same-origin fetch — it's a public static asset, no auth needed.
    fetch('/reading-news.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d && Array.isArray(d.items) && d.items.length > 0) setData(d);
      })
      .catch(() => {
        /* no feed → bar stays hidden */
      });
    return () => {
      alive = false;
    };
  }, []);

  const items = data?.items || [];

  useEffect(() => {
    if (items.length <= 1 || paused || open || reduceMotion) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [items.length, paused, open, reduceMotion]);

  if (items.length === 0) return null;

  const current = items[index % items.length];

  return (
    <>
      <Box
        role="button"
        tabIndex={0}
        aria-label="Open Reading News"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 1.25,
          mb: 3,
          borderRadius: '12px',
          cursor: 'pointer',
          backgroundColor: 'rgba(107, 142, 107, 0.08)',
          border: '1px solid rgba(107, 142, 107, 0.18)',
          transition: 'background-color 0.2s ease',
          '&:hover': { backgroundColor: 'rgba(107, 142, 107, 0.13)' },
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: 2,
          },
        }}
      >
        <AutoStoriesRoundedIcon sx={{ color: 'primary.main', flexShrink: 0 }} />
        <Typography
          component="span"
          sx={{
            flexShrink: 0,
            fontWeight: 800,
            fontSize: '0.7rem',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'primary.dark',
            display: { xs: 'none', sm: 'block' },
          }}
        >
          Reading News
        </Typography>
        <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <Fade in key={current.id} timeout={500}>
            <Typography
              noWrap
              title={current.headline}
              sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.9rem' }}
            >
              {current.headline}
            </Typography>
          </Fade>
        </Box>
        <Typography
          component="span"
          sx={{
            flexShrink: 0,
            fontSize: '0.8rem',
            fontWeight: 600,
            color: 'text.secondary',
            display: { xs: 'none', md: 'block' },
          }}
        >
          Read more
        </Typography>
        <ChevronRightRoundedIcon sx={{ color: 'text.secondary', flexShrink: 0 }} />
      </Box>

      <ReadingNewsDialog open={open} data={data} onClose={() => setOpen(false)} />
    </>
  );
}
