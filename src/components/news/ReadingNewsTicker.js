import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Fade } from '@mui/material';
import AutoStoriesRoundedIcon from '@mui/icons-material/AutoStoriesRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { countdownLabel, shortDate } from './newsFormat';

const ROTATE_MS = 6000;

/** Headlines to rotate: live celebration events first, then news, then diary dates. */
function tickerLines(data, liveEvents) {
  const lines = (liveEvents || []).map((e) => e.message).filter(Boolean);
  if (!data) return lines;
  lines.push(...(data.items || []).map((i) => i.headline).filter(Boolean));
  for (const e of data.events || []) {
    if (!e?.name) continue;
    const when = countdownLabel(e.date) || shortDate(e.date);
    lines.push(when ? `${e.name} — ${when}` : e.name);
  }
  return lines;
}

/**
 * Reading News ticker — a quiet, warm bar that rotates today's celebration
 * events (band-ups, badges) and the latest headlines, opening the Reading News
 * tab on click. Presentational: it receives the already-fetched feed, today's
 * live events, and an `onOpen` callback. Renders nothing when there's nothing
 * to show. `compact` renders the slimmer header variant.
 */
export default function ReadingNewsTicker({ data, liveEvents, onOpen, compact = false }) {
  const lines = useMemo(() => tickerLines(data, liveEvents), [data, liveEvents]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const reduceMotion = useMemo(() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (lines.length <= 1 || paused || reduceMotion) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % lines.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [lines.length, paused, reduceMotion]);

  if (lines.length === 0) return null;

  const current = lines[index % lines.length];

  return (
    <Box
      role="button"
      tabIndex={0}
      aria-label="Open Reading News"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen?.();
        }
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 1 : 1.5,
        px: compact ? 1.5 : 2,
        py: compact ? 0.5 : 1.25,
        mb: compact ? 0 : 3,
        borderRadius: compact ? '10px' : '12px',
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
      <AutoStoriesRoundedIcon
        sx={{ color: 'primary.main', flexShrink: 0, fontSize: compact ? 18 : 24 }}
      />
      {!compact && (
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
      )}
      <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <Fade in key={index} timeout={500}>
          <Typography
            noWrap
            title={current}
            sx={{
              fontWeight: 600,
              color: 'text.primary',
              fontSize: compact ? '0.8rem' : '0.9rem',
            }}
          >
            {current}
          </Typography>
        </Fade>
      </Box>
      {!compact && (
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
      )}
      <ChevronRightRoundedIcon
        sx={{ color: 'text.secondary', flexShrink: 0, fontSize: compact ? 18 : 24 }}
      />
    </Box>
  );
}
