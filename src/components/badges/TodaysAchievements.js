import React, { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Paper, Skeleton, Button } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import { BadgeArt } from './BadgeIcon';
import { BADGE_DEFINITIONS } from '../../utils/badgeDefinitions';

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

// Messages arrive as "🏅 Maisie earned the Bookworm badge!" for the header
// ticker. Here the rosette is the icon, so the leading emoji is dropped and
// the badge name is looked up to pick the artwork.
const stripLeadingEmoji = (s) => (s || '').replace(/^[^\p{L}\p{N}]+/u, '');

const familyForMessage = (message) => {
  const m = /earned the (.+?) badge/i.exec(message || '');
  if (!m) return null;
  const def = BADGE_DEFINITIONS.find((d) => d.name === m[1]);
  return def ? def.icon : null;
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
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        {bandCount} band {bandCount === 1 ? 'move' : 'moves'} and {badgeCount}{' '}
        {badgeCount === 1 ? 'badge' : 'badges'} in the last day
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {visibleEvents.map((event) => {
          const family = event.type === 'badge' ? familyForMessage(event.message) : null;
          return (
            <Box
              key={event.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 1.5,
                py: 1,
                borderRadius: 3,
                backgroundColor: 'background.paper',
                border: '1px solid #F0E4CC',
              }}
            >
              {event.type === 'band' ? (
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(138, 173, 138, 0.18)',
                    flex: '0 0 auto',
                  }}
                >
                  <TrendingUpIcon sx={{ color: 'primary.dark' }} />
                </Box>
              ) : (
                <BadgeArt icon={family || 'hidden'} size={44} />
              )}
              <Typography
                variant="body1"
                sx={{ flex: 1, fontFamily: '"Nunito", sans-serif', fontWeight: 600 }}
              >
                {stripLeadingEmoji(event.message)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                {formatWhen(event.createdAt)}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
