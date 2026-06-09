import React from 'react';
import { Box, Paper, Typography, Chip, Link, Divider } from '@mui/material';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import CakeRoundedIcon from '@mui/icons-material/CakeRounded';
import EventRoundedIcon from '@mui/icons-material/EventRounded';
import { dateParts, longDate, sortEvents } from './newsFormat';

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
  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
      <Box
        sx={{
          flexShrink: 0,
          width: 52,
          textAlign: 'center',
          borderRadius: '10px',
          py: 0.75,
          backgroundColor: 'rgba(107, 142, 107, 0.1)',
          border: '1px solid rgba(107, 142, 107, 0.2)',
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
 * Reading News — the full newsletter, shown as a tab on the Stats page. Reads
 * top-to-bottom like an issue: masthead, the author/book news tied to the
 * school's most-read titles, then dated diary items (events + author
 * birthdays). Fed by `/reading-news.json`.
 */
export default function ReadingNewsPage({ data }) {
  const items = data?.items || [];
  const events = sortEvents(data?.events);
  const updated = longDate(data?.generatedAt);

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

      {items.length > 0 && (
        <>
          <SectionHeading>From your shelves</SectionHeading>
          <Box
            sx={{
              columnGap: 4,
              rowGap: 3.5,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
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
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {events.map((event) => (
              <DiaryRow key={event.id} event={event} />
            ))}
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
