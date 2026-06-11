import React, { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Paper, Chip, Skeleton, Button } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';

/** ticker_events timestamps are UTC 'YYYY-MM-DD HH:MM:SS' */
const parseUtc = (s) => new Date(`${s.replace(' ', 'T')}Z`);

const formatWhen = (createdAt) => {
  const date = parseUtc(createdAt);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
  return isToday ? time : `Yesterday ${time}`;
};

const TYPE_STYLES = {
  band: {
    icon: <TrendingUpIcon sx={{ color: '#6B8E6B' }} />,
    background: 'rgba(138, 173, 138, 0.12)',
    border: '1px solid rgba(138, 173, 138, 0.35)',
  },
  badge: {
    icon: <EmojiEventsIcon sx={{ color: '#C9A227' }} />,
    background: 'rgba(201, 162, 39, 0.10)',
    border: '1px solid rgba(201, 162, 39, 0.30)',
  },
};

export default function TodaysAchievements({ fetchWithAuth, globalClassFilter }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(false);

  const loadEvents = () => {
    setError(false);
    fetchWithAuth('/api/badges/today')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setEvents(d.events || []))
      .catch(() => {
        setEvents([]);
        setError(true);
      });
  };

  useEffect(loadEvents, [fetchWithAuth]);

  const visibleEvents = useMemo(() => {
    if (!events) return [];
    if (!globalClassFilter || globalClassFilter === 'all') return events;
    if (globalClassFilter === 'unassigned') {
      return events.filter((e) => !e.classId);
    }
    return events.filter((e) => e.classId === globalClassFilter);
  }, [events, globalClassFilter]);

  const bandCount = visibleEvents.filter((e) => e.type === 'band').length;
  const badgeCount = visibleEvents.filter((e) => e.type === 'badge').length;

  if (events === null) {
    return (
      <Box>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} variant="rectangular" height={64} sx={{ mb: 1.5, borderRadius: 3 }} />
        ))}
      </Box>
    );
  }

  if (error) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          Couldn&apos;t load today&apos;s achievements.
        </Typography>
        <Button variant="outlined" onClick={loadEvents}>
          Try again
        </Button>
      </Paper>
    );
  }

  if (visibleEvents.length === 0) {
    return (
      <Paper sx={{ p: 5, textAlign: 'center', borderRadius: 4 }}>
        <AutoStoriesIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1.5 }} />
        <Typography
          variant="h6"
          sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, mb: 0.5 }}
        >
          Nothing to celebrate just yet
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Band moves and badges from the last day will appear here as reading sessions are logged.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        <Chip
          icon={<TrendingUpIcon />}
          label={`${bandCount} band ${bandCount === 1 ? 'move' : 'moves'}`}
          sx={{ fontWeight: 700, backgroundColor: 'rgba(138, 173, 138, 0.18)' }}
        />
        <Chip
          icon={<EmojiEventsIcon />}
          label={`${badgeCount} ${badgeCount === 1 ? 'badge' : 'badges'} earned`}
          sx={{ fontWeight: 700, backgroundColor: 'rgba(201, 162, 39, 0.15)' }}
        />
      </Box>

      {visibleEvents.map((event) => {
        const style = TYPE_STYLES[event.type] || TYPE_STYLES.badge;
        return (
          <Paper
            key={event.id}
            elevation={0}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              p: 2,
              mb: 1.5,
              borderRadius: 3,
              background: style.background,
              border: style.border,
            }}
          >
            {style.icon}
            <Typography
              variant="body1"
              sx={{ flex: 1, fontFamily: '"Nunito", sans-serif', fontWeight: 600 }}
            >
              {event.message}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
              {formatWhen(event.createdAt)}
            </Typography>
          </Paper>
        );
      })}
    </Box>
  );
}
