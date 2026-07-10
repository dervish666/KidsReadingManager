import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Paper, CircularProgress, Alert, Chip, Button } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import BookCover from '../BookCover';
import StreakBadge from '../students/StreakBadge';
import GardenHeader from '../badges/GardenHeader';
import BadgeCelebration from '../badges/BadgeCelebration';
import BadgeIcon from '../badges/BadgeIcon';
import BandCelebration from '../badges/BandCelebration';
import { ReadingBandProgress } from '../students/ReadingBandChip';
import TallyLogo from '../TallyLogo';
import BookIdeasTab from './BookIdeasTab';
import RecDetailSheet from './RecDetailSheet';
import LogReadingSheet from './LogReadingSheet';
import BookSearchSheet from './BookSearchSheet';
import { NUNITO, sectionTitleSx, tappableCardSx } from './parentPortalStyles';

/**
 * ParentPortal - Public-facing parent view accessed via QR code token.
 * Renders student reading info and allows parents to log reading sessions.
 * Uses plain fetch() (no auth) — all API calls go to /api/parent/{token}.
 *
 * The bottom sheets live in sibling components (LogReadingSheet,
 * BookSearchSheet, RecDetailSheet); this component owns the portal data,
 * tab state, the chosen log book (shared between the sheets) and the
 * celebration overlays.
 */
const ParentPortal = () => {
  const theme = useTheme();
  const { accent, accentHover } = theme.palette.parent;
  const accentGradient = `linear-gradient(135deg, ${accent} 0%, ${accentHover} 100%)`;

  const token = window.location.pathname.split('/parent/')[1] || '';
  const apiBase = `/api/parent/${token}`;

  // ── Data state ──────────────────────────────────────────────────────────────
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Sheets: log reading + book search (the chosen book is shared) ──────────
  const [logOpen, setLogOpen] = useState(false);
  const [logBook, setLogBook] = useState(null);
  const [bookSearchOpen, setBookSearchOpen] = useState(false);
  const [searchTarget, setSearchTarget] = useState('log'); // 'current' | 'log'

  // ── Celebrations ────────────────────────────────────────────────────────────
  const [newBadges, setNewBadges] = useState([]);
  const [bandUpToShow, setBandUpToShow] = useState(null);

  // ── Active tab: 'reading' (default) | 'ideas' ────────────────────────────────
  const [activeTab, setActiveTab] = useState('reading');

  // ── Book Ideas: lazy-loaded when the tab is first opened ─────────────────────
  const [bookIdeas, setBookIdeas] = useState({ ai: [], library: [] });
  const [bookIdeasLoading, setBookIdeasLoading] = useState(false);
  const [bookIdeasLoaded, setBookIdeasLoaded] = useState(false);
  const [detailRec, setDetailRec] = useState(null); // rec shown in the detail sheet

  // ── Fetch portal data ───────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(apiBase);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'This link is invalid or has expired.');
      }
      const json = await res.json();
      setData(json);
      // Pre-fill log book with current book if available
      if (json.currentBook && !logBook) {
        setLogBook(json.currentBook);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Show band-up celebration whenever the portal data carries a bandUp payload.
  useEffect(() => {
    if (data?.bandUp) {
      setBandUpToShow(data.bandUp);
    }
  }, [data?.bandUp]);

  // Lazy-load Book Ideas the first time the tab is opened (keeps the main portal
  // load light — the live library match runs only when a parent actually looks).
  useEffect(() => {
    if (activeTab !== 'ideas' || bookIdeasLoaded) return undefined;
    let cancelled = false;
    setBookIdeasLoading(true);
    (async () => {
      let ok = false;
      try {
        const res = await fetch(`${apiBase}/book-ideas`);
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) {
            setBookIdeas({ ai: json.ai || [], library: json.library || [] });
          }
          ok = true;
        }
      } catch {
        // Fail-open — the empty state covers a failed fetch.
      } finally {
        if (!cancelled) {
          setBookIdeasLoading(false);
          // Only cache a successful load — a transient failure should retry the
          // next time the tab is opened, not stick on an empty state.
          if (ok) setBookIdeasLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, bookIdeasLoaded, apiBase]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const firstName = data?.studentFirstName || '';

  const formatSessionDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  // ── Book selection (from the search sheet) ──────────────────────────────────
  const handleSelectBook = (book) => {
    if (searchTarget === 'current') {
      setData((prev) => ({ ...prev, currentBook: book }));
      setLogBook(book);
    } else {
      setLogBook(book);
    }
    setBookSearchOpen(false);
  };

  const handleOpenBookSearch = (target) => {
    setSearchTarget(target);
    setBookSearchOpen(true);
  };

  // ── Loading / Error states ──────────────────────────────────────────────────
  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          bgcolor: 'parent.surface',
        }}
      >
        <CircularProgress sx={{ color: 'parent.accent' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          maxWidth: 480,
          mx: 'auto',
          px: 2,
          pt: 8,
          textAlign: 'center',
          bgcolor: 'parent.surface',
          minHeight: '100vh',
        }}
      >
        <TallyLogo size={48} color={accent} />
        <Typography
          variant="h6"
          sx={{ mt: 2, color: 'parent.accent', fontFamily: NUNITO, fontWeight: 700 }}
        >
          Tally Reading
        </Typography>
        <Alert severity="error" sx={{ mt: 3, textAlign: 'left' }}>
          {error}
        </Alert>
      </Box>
    );
  }

  const { currentBook, streak, sessions = [], badgeCount = 0, badges = [] } = data || {};

  return (
    <Box sx={{ maxWidth: 480, mx: 'auto', bgcolor: 'parent.surface', minHeight: '100vh', pb: 6 }}>
      {/* ── Header bar ──────────────────────────────────────────────────── */}
      <Box
        sx={{
          background: accentGradient,
          px: 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <TallyLogo size={24} color="white" />
        <Typography
          variant="subtitle1"
          sx={{ color: 'white', fontWeight: 700, fontFamily: NUNITO }}
        >
          Tally Reading
        </Typography>
      </Box>

      <Box sx={{ px: 2, pt: 3 }}>
        {/* ── Student name heading ─────────────────────────────────────── */}
        <Typography
          variant="h5"
          sx={{
            fontWeight: 800,
            color: 'parent.accent',
            fontFamily: NUNITO,
            mb: 2,
          }}
        >
          {firstName}&apos;s Reading
        </Typography>

        {/* ── Tab switcher: Reading | Book Ideas ────────────────────────── */}
        <Box
          role="tablist"
          aria-label="Reading and book ideas"
          sx={{
            display: 'flex',
            gap: 0.5,
            p: 0.5,
            mb: 3,
            borderRadius: '999px',
            bgcolor: alpha(accent, 0.08),
          }}
        >
          {[
            {
              value: 'reading',
              label: 'Reading',
              icon: <AutoStoriesIcon sx={{ fontSize: 18 }} />,
            },
            {
              value: 'ideas',
              label: 'Book Ideas',
              icon: <LightbulbIcon sx={{ fontSize: 18 }} />,
            },
          ].map((tab) => {
            const selected = activeTab === tab.value;
            return (
              <Box
                key={tab.value}
                component="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.value)}
                sx={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0.75,
                  minHeight: 44,
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '999px',
                  fontFamily: NUNITO,
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  color: selected ? 'white' : 'parent.accent',
                  background: selected ? accentGradient : 'transparent',
                  boxShadow: selected ? `0 2px 8px ${alpha(accent, 0.25)}` : 'none',
                  transition: 'all 0.2s ease',
                  '&:focus-visible': {
                    outline: '2px solid',
                    outlineColor: accentHover,
                    outlineOffset: 2,
                  },
                }}
              >
                {tab.icon}
                {tab.label}
              </Box>
            );
          })}
        </Box>

        {activeTab === 'reading' && (
          <>
            {/* ── Current book card ────────────────────────────────────────── */}
            <Paper
              component="button"
              onClick={() => handleOpenBookSearch('current')}
              elevation={0}
              sx={{
                ...tappableCardSx,
                p: 2,
                mb: 2,
                borderRadius: 3,
                border: `1px solid ${alpha(accent, 0.15)}`,
                bgcolor: 'white',
                gap: 2,
                transition: 'box-shadow 0.2s ease',
                '&:hover': { boxShadow: `0 4px 16px ${alpha(accent, 0.12)}` },
              }}
            >
              {currentBook ? (
                <>
                  <BookCover
                    title={currentBook.title}
                    author={currentBook.author}
                    isbn={currentBook.isbn}
                    width={48}
                    height={72}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', fontWeight: 500, display: 'block' }}
                    >
                      Currently reading
                    </Typography>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 700, color: 'parent.accent' }}
                      noWrap
                    >
                      {currentBook.title}
                    </Typography>
                    {currentBook.author && (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {currentBook.author}
                      </Typography>
                    )}
                  </Box>
                </>
              ) : (
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    No current book yet. Tap to choose one
                  </Typography>
                </Box>
              )}
            </Paper>

            {/* ── Streak + Read Today row ──────────────────────────────────── */}
            <Box
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}
            >
              <StreakBadge streak={streak?.current || 0} size="large" showLabel />
              <Button
                variant="contained"
                size="large"
                onClick={() => setLogOpen(true)}
                sx={{
                  background: accentGradient,
                  borderRadius: 3,
                  fontWeight: 700,
                  fontFamily: NUNITO,
                  px: 3,
                  py: 1.25,
                  boxShadow: `0 4px 16px ${alpha(accent, 0.25)}`,
                  '&:hover': {
                    background: accentGradient,
                    boxShadow: `0 6px 20px ${alpha(accent, 0.35)}`,
                  },
                }}
              >
                Read Today
              </Button>
            </Box>

            {/* ── Reading band progress ────────────────────────────────────── */}
            {data?.band && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ ...sectionTitleSx, mb: 1 }}>
                  Reading Band
                </Typography>
                <ReadingBandProgress
                  readsCount={data.band.readsCount}
                  readsPerBand={data.band.readsPerBand}
                  bands={data.bands}
                />
              </Box>
            )}

            {/* ── Recent sessions ──────────────────────────────────────────── */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ ...sectionTitleSx, mb: 1.5 }}>
                Recent Sessions
              </Typography>
              {sessions.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {sessions.slice(0, 10).map((session, i) => {
                    const isHome = session.location === 'home';
                    const locationColor = isHome
                      ? theme.palette.accent.home
                      : theme.palette.accent.school;
                    return (
                      <Box
                        key={session.id || i}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          py: 0.75,
                          px: 1,
                          borderRadius: 2,
                          bgcolor: 'white',
                          border: `1px solid ${alpha(accent, 0.08)}`,
                        }}
                      >
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor: locationColor,
                            flexShrink: 0,
                          }}
                        />
                        <Typography
                          variant="body2"
                          sx={{ flex: 1, color: 'text.primary', fontWeight: 500 }}
                          noWrap
                        >
                          {session.bookTitle || 'Unknown book'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                          {formatSessionDate(session.date)}
                        </Typography>
                        <Chip
                          label={isHome ? 'Home' : 'School'}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            bgcolor: isHome
                              ? theme.palette.accent.homeLight
                              : theme.palette.accent.schoolLight,
                            color: locationColor,
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        />
                      </Box>
                    );
                  })}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No reading logged yet. Tap Read Today after you read together to start {firstName}
                  &apos;s record.
                </Typography>
              )}
            </Box>

            {/* ── Reading Garden ───────────────────────────────────────────── */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ ...sectionTitleSx, mb: 1 }}>
                Reading Garden
              </Typography>
              <GardenHeader badgeCount={badgeCount} height={160} />
              {badges.length > 0 ? (
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    gap: 1,
                    mt: 1.5,
                  }}
                >
                  {badges.map((badge) => (
                    <BadgeIcon key={`${badge.badgeId}-${badge.earnedAt}`} badge={badge} />
                  ))}
                </Box>
              ) : (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 1.5, textAlign: 'center' }}
                >
                  Badges {firstName} earns will appear here.
                </Typography>
              )}
            </Box>
          </>
        )}

        {/* ── Book Ideas tab ───────────────────────────────────────────── */}
        {activeTab === 'ideas' && (
          <BookIdeasTab
            firstName={firstName}
            bookIdeas={bookIdeas}
            loading={bookIdeasLoading}
            onOpenDetail={setDetailRec}
          />
        )}
      </Box>

      {/* ── Log Reading bottom sheet ─────────────────────────────────────── */}
      <LogReadingSheet
        open={logOpen}
        apiBase={apiBase}
        logBook={logBook}
        streak={streak}
        onChooseBook={() => handleOpenBookSearch('log')}
        onClose={() => setLogOpen(false)}
        onLogged={async (result) => {
          if (result.newBadges && result.newBadges.length > 0) {
            setNewBadges(result.newBadges);
          }
          await fetchData();
        }}
      />

      {/* ── Book search bottom sheet (owns the barcode scanner) ─────────── */}
      <BookSearchSheet
        open={bookSearchOpen}
        apiBase={apiBase}
        onSelect={handleSelectBook}
        onClose={() => setBookSearchOpen(false)}
      />

      {/* ── Book detail bottom sheet ─────────────────────────────────────── */}
      <RecDetailSheet rec={detailRec} onClose={() => setDetailRec(null)} />

      {/* ── Badge celebration ────────────────────────────────────────────── */}
      <BadgeCelebration badges={newBadges} onClose={() => setNewBadges([])} />

      {/* ── Band-up celebration ──────────────────────────────────────────── */}
      <BandCelebration
        bandUp={bandUpToShow}
        studentName={firstName}
        onClose={() => setBandUpToShow(null)}
      />
    </Box>
  );
};

export default ParentPortal;
