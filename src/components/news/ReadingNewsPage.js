import React, { useMemo, useRef } from 'react';
import { Box, Paper, Typography, Chip, Link, Divider } from '@mui/material';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import CakeRoundedIcon from '@mui/icons-material/CakeRounded';
import EventRoundedIcon from '@mui/icons-material/EventRounded';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import TipsAndUpdatesRoundedIcon from '@mui/icons-material/TipsAndUpdatesRounded';
import { dateParts, longDate, sortEvents, countdownLabel, ordinal } from './newsFormat';

const KIND_LABEL = {
  release: 'New release',
  news: 'News',
  award: 'Award',
  spotlight: 'Spotlight',
};
const KIND_COLOR = {
  release: 'rgba(74, 103, 65, 0.14)',
  news: 'rgba(139, 115, 85, 0.14)',
  award: 'rgba(193, 154, 64, 0.18)',
  spotlight: 'rgba(107, 142, 107, 0.14)',
};

// Most-read placement badge tint — gold at the top of the chart, sage below.
function rankSx(rank) {
  if (rank === 1) return { bg: 'rgba(193, 154, 64, 0.24)', fg: '#7a5c12' };
  if (rank <= 3) return { bg: 'rgba(139, 115, 85, 0.16)', fg: 'text.primary' };
  return { bg: 'rgba(107, 142, 107, 0.12)', fg: 'text.primary' };
}

/** Small uppercase section heading with a hairline rule. */
function SectionHeading({ children }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 4, mb: 2.5 }}>
      <Typography
        sx={{
          fontWeight: 800,
          fontSize: '0.78rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'primary.dark',
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </Typography>
      <Divider sx={{ flex: 1, borderColor: 'rgba(139, 115, 85, 0.22)' }} />
    </Box>
  );
}

/** One "From your shelves" article. */
function Article({ item }) {
  return (
    <Box sx={{ breakInside: 'avoid' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75, flexWrap: 'wrap' }}>
        {item.rank != null && (
          <Chip
            icon={<EmojiEventsRoundedIcon sx={{ fontSize: 14 }} />}
            label={`${ordinal(item.rank)} most-read`}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.68rem',
              fontWeight: 700,
              backgroundColor: rankSx(item.rank).bg,
              color: rankSx(item.rank).fg,
              '& .MuiChip-icon': { color: 'inherit' },
            }}
          />
        )}
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
      <Typography
        sx={{
          fontFamily: '"Nunito", sans-serif',
          fontWeight: 800,
          fontSize: '1.08rem',
          lineHeight: 1.25,
          color: 'text.primary',
          mb: 0.5,
        }}
      >
        {item.headline}
      </Typography>
      {item.summary && (
        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.55 }}>
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
            mt: 0.75,
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          {item.source || 'Read more'}
          <OpenInNewRoundedIcon sx={{ fontSize: 14 }} />
        </Link>
      ) : (
        item.source && (
          <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: 'text.disabled' }}>
            Source: {item.source}
          </Typography>
        )
      )}
    </Box>
  );
}

/** One "Dates for the diary" row with a date badge. */
function DiaryRow({ event }) {
  const parts = dateParts(event.date);
  const isBirthday = event.kind === 'birthday';
  const cd = countdownLabel(event.date);
  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
      <Box
        sx={{
          flexShrink: 0,
          width: 52,
          textAlign: 'center',
          borderRadius: '10px',
          py: 0.75,
          backgroundColor: '#FFFDF7',
          border: '1px solid rgba(107, 142, 107, 0.35)',
        }}
      >
        <Typography
          sx={{ fontWeight: 800, fontSize: '1.2rem', lineHeight: 1, color: 'primary.dark' }}
        >
          {parts ? parts.day : '—'}
        </Typography>
        <Typography
          sx={{
            fontSize: '0.62rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: 'text.secondary',
          }}
        >
          {parts ? parts.mon : ''}
        </Typography>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          {isBirthday ? (
            <CakeRoundedIcon sx={{ fontSize: 16, color: 'rgba(193, 154, 64, 0.95)' }} />
          ) : (
            <EventRoundedIcon sx={{ fontSize: 16, color: 'primary.main' }} />
          )}
          <Typography sx={{ fontWeight: 700, color: 'text.primary' }}>{event.name}</Typography>
          {cd && (
            <Chip
              label={cd}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.65rem',
                fontWeight: 700,
                backgroundColor: 'rgba(107, 142, 107, 0.14)',
                color: 'primary.dark',
              }}
            />
          )}
        </Box>
        {event.blurb && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25, lineHeight: 1.5 }}>
            {event.blurb}
          </Typography>
        )}
        {event.link && (
          <Link
            href={event.link}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              mt: 0.5,
              fontSize: '0.78rem',
              fontWeight: 600,
            }}
          >
            More
            <OpenInNewRoundedIcon sx={{ fontSize: 13 }} />
          </Link>
        )}
      </Box>
    </Box>
  );
}

/**
 * Build the rotation pool for the "Reading roundup" card: curated general
 * items from the feed, plus two derived from the diary — the closest upcoming
 * event and the next author birthday (with whatever link the event carries,
 * usually Wikipedia). One is shown at random per page load to keep it fresh.
 */
function buildRoundupPool(data) {
  const pool = (data?.general || [])
    .filter((g) => g && g.text)
    .map((g) => ({
      id: g.id,
      label: g.label || 'Did you know?',
      text: g.text,
      source: g.source || null,
      link: g.link || null,
    }));
  const events = sortEvents(data?.events);
  const next = events[0];
  if (next) {
    const cd = countdownLabel(next.date);
    pool.push({
      id: 'roundup-coming-up',
      label: 'Coming up',
      text: `${next.name}${cd ? ` — ${cd}` : ''}.${next.blurb ? ` ${next.blurb}` : ''}`,
      source: null,
      link: next.link || null,
    });
  }
  const bday = events.find((e) => e.kind === 'birthday');
  if (bday) {
    const cd = countdownLabel(bday.date);
    pool.push({
      id: 'roundup-birthday',
      label: 'Birthday watch',
      text: `${bday.name}${cd ? ` — ${cd}` : ''}.${bday.blurb ? ` ${bday.blurb}` : ''}`,
      source: bday.link && bday.link.includes('wikipedia') ? 'Wikipedia' : null,
      link: bday.link || null,
    });
  }
  return pool;
}

/** The rotating "Reading roundup" callout — one general item per page load. */
function RoundupCard({ pick }) {
  if (!pick) return null;
  return (
    <Box
      sx={{
        mt: 3,
        p: 2,
        display: 'flex',
        gap: 1.5,
        alignItems: 'flex-start',
        borderRadius: '12px',
        backgroundColor: 'rgba(107, 142, 107, 0.08)',
        border: '1px solid rgba(107, 142, 107, 0.2)',
      }}
    >
      <TipsAndUpdatesRoundedIcon sx={{ color: 'primary.main', flexShrink: 0, mt: 0.25 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            fontWeight: 800,
            fontSize: '0.68rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'primary.dark',
            mb: 0.25,
          }}
        >
          {pick.label}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.primary', lineHeight: 1.55 }}>
          {pick.text}
        </Typography>
        {pick.link ? (
          <Link
            href={pick.link}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              mt: 0.75,
              fontSize: '0.78rem',
              fontWeight: 600,
            }}
          >
            {pick.source || 'Read more'}
            <OpenInNewRoundedIcon sx={{ fontSize: 13 }} />
          </Link>
        ) : (
          pick.source && (
            <Typography
              variant="caption"
              sx={{ display: 'block', mt: 0.5, color: 'text.disabled' }}
            >
              {pick.source}
            </Typography>
          )
        )}
      </Box>
    </Box>
  );
}

/**
 * Reading News — the full newsletter, shown as a tab on the Stats page. Reads
 * top-to-bottom like an issue: masthead, a rotating general roundup, the
 * author/book news tied to the school's most-read titles, then dated diary
 * items (events + author birthdays). Fed by `/reading-news.json`.
 */
export default function ReadingNewsPage({ data }) {
  const items = data?.items || [];
  const events = sortEvents(data?.events);
  const updated = longDate(data?.generatedAt);

  // Pick one roundup item at random, once per mount (i.e. per visit/reload),
  // so the general content rotates and stays fresh.
  const pool = useMemo(() => buildRoundupPool(data), [data]);
  const pickRef = useRef(null);
  if (pickRef.current === null && pool.length > 0) {
    pickRef.current = Math.floor(Math.random() * pool.length);
  }
  const roundup = pool.length > 0 ? pool[pickRef.current % pool.length] : null;

  if (!data || (items.length === 0 && events.length === 0)) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
        <Typography variant="body1" color="text.secondary">
          No reading news just yet — check back soon.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      sx={{
        p: { xs: 2.5, sm: 4 },
        borderRadius: 4,
        backgroundColor: '#FFFDF7',
        border: '1px solid rgba(139, 115, 85, 0.12)',
      }}
    >
      {/* Masthead */}
      <Box sx={{ textAlign: 'center', pb: 2 }}>
        <Typography
          sx={{
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'primary.main',
          }}
        >
          {data.issue || 'Latest issue'}
        </Typography>
        <Typography
          sx={{
            fontFamily: '"Nunito", sans-serif',
            fontWeight: 800,
            fontSize: { xs: '2rem', sm: '2.6rem' },
            color: 'text.primary',
            lineHeight: 1.1,
            mt: 0.5,
          }}
        >
          {data.title || 'Reading News'}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          News from the books your readers love
        </Typography>
      </Box>
      <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.25)', borderBottomWidth: 2 }} />

      {data.intro && (
        <Typography
          sx={{
            mt: 2.5,
            color: 'text.primary',
            fontSize: '1.02rem',
            lineHeight: 1.6,
            fontStyle: 'italic',
            textAlign: 'center',
            maxWidth: 720,
            mx: 'auto',
          }}
        >
          {data.intro}
        </Typography>
      )}

      <RoundupCard pick={roundup} />

      {items.length > 0 && (
        <>
          <SectionHeading>From your shelves</SectionHeading>
          <Box
            sx={{
              columnGap: 4,
              rowGap: 3.5,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              // Odd count: let the last article span both columns so it doesn't
              // leave a lonely orphan in the grid.
              ...(items.length % 2 === 1 && {
                '& > :last-child': { gridColumn: { md: '1 / -1' } },
              }),
            }}
          >
            {items.map((item) => (
              <Article key={item.id} item={item} />
            ))}
          </Box>
        </>
      )}

      {events.length > 0 && (
        <>
          <SectionHeading>Dates for the diary</SectionHeading>
          <Box sx={{ position: 'relative' }}>
            {/* Timeline rail behind the date nodes */}
            <Box
              sx={{
                position: 'absolute',
                left: 26,
                top: 12,
                bottom: 12,
                width: 2,
                backgroundColor: 'rgba(107, 142, 107, 0.25)',
              }}
            />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, position: 'relative' }}>
              {events.map((event) => (
                <DiaryRow key={event.id} event={event} />
              ))}
            </Box>
          </Box>
        </>
      )}

      <Divider sx={{ mt: 4, mb: 1.5, borderColor: 'rgba(139, 115, 85, 0.15)' }} />
      <Typography
        variant="caption"
        sx={{ display: 'block', textAlign: 'center', color: 'text.disabled' }}
      >
        {updated ? `Updated ${updated} · ` : ''}sources linked above
      </Typography>
    </Paper>
  );
}
