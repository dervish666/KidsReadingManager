import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Chip,
  Button,
  Dialog,
  DialogContent,
  TextField,
  InputAdornment,
} from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import BookCover from '../BookCover';
import BookCoverPlaceholder from '../BookCoverPlaceholder';
import BarcodeScanner from '../books/BarcodeScanner';
import StreakBadge from '../students/StreakBadge';
import GardenHeader from '../badges/GardenHeader';
import BadgeCelebration from '../badges/BadgeCelebration';
import BadgeIcon from '../badges/BadgeIcon';
import BandCelebration from '../badges/BandCelebration';
import { ReadingBandProgress } from '../students/ReadingBandChip';
import TallyLogo from '../TallyLogo';

const NUNITO = '"Nunito", sans-serif';

const sectionTitleSx = {
  fontWeight: 700,
  color: 'parent.accent',
  fontFamily: NUNITO,
};

// Tappable cards render as real <button> elements so they work for keyboard
// and screen-reader users; these resets undo the native button styling.
const tappableCardSx = {
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
  font: 'inherit',
  appearance: 'none',
  '&:focus-visible': {
    outline: '2px solid',
    outlineColor: 'parent.accentHover',
    outlineOffset: 2,
  },
};

/**
 * ParentPortal - Public-facing parent view accessed via QR code token.
 * Renders student reading info and allows parents to log reading sessions.
 * Uses plain fetch() (no auth) — all API calls go to /api/parent/{token}.
 */
const ParentPortal = () => {
  const theme = useTheme();
  const { accent, accentHover, surface, accentBorder } = theme.palette.parent;
  const accentGradient = `linear-gradient(135deg, ${accent} 0%, ${accentHover} 100%)`;

  const token = window.location.pathname.split('/parent/')[1] || '';
  const apiBase = `/api/parent/${token}`;

  // ── Data state ──────────────────────────────────────────────────────────────
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Log reading sheet state ─────────────────────────────────────────────────
  const [logOpen, setLogOpen] = useState(false);
  const [logDate, setLogDate] = useState('today');
  const [customDate, setCustomDate] = useState('');
  const [logBook, setLogBook] = useState(null);
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [logError, setLogError] = useState(null);
  const [logSuccess, setLogSuccess] = useState(false);

  // ── Book search state ───────────────────────────────────────────────────────
  const [bookSearchOpen, setBookSearchOpen] = useState(false);
  const [bookQuery, setBookQuery] = useState('');
  const [bookResults, setBookResults] = useState({ library: [], external: [] });
  const [bookSearchLoading, setBookSearchLoading] = useState(false);
  const [searchTarget, setSearchTarget] = useState('log'); // 'current' | 'log'
  const [scannerOpen, setScannerOpen] = useState(false);

  // ── Badge celebration state ─────────────────────────────────────────────────
  const [newBadges, setNewBadges] = useState([]);

  // ── Band-up celebration state ────────────────────────────────────────────────
  const [bandUpToShow, setBandUpToShow] = useState(null);

  // ── Active tab: 'reading' (default) | 'ideas' ────────────────────────────────
  const [activeTab, setActiveTab] = useState('reading');

  // ── Book Ideas: lazy-loaded when the tab is first opened ─────────────────────
  const [bookIdeas, setBookIdeas] = useState({ ai: [], library: [] });
  const [bookIdeasLoading, setBookIdeasLoading] = useState(false);
  const [bookIdeasLoaded, setBookIdeasLoaded] = useState(false);
  const [detailRec, setDetailRec] = useState(null); // rec shown in the detail sheet

  const today = new Date().toISOString().split('T')[0];

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
    if (activeTab !== 'ideas' || bookIdeasLoaded) return;
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

  // ── Book search debounce ────────────────────────────────────────────────────
  useEffect(() => {
    if (!bookSearchOpen || !bookQuery.trim()) {
      setBookResults({ library: [], external: [] });
      return;
    }

    const timer = setTimeout(async () => {
      setBookSearchLoading(true);
      try {
        const res = await fetch(`${apiBase}/books?q=${encodeURIComponent(bookQuery.trim())}`);
        if (res.ok) {
          const json = await res.json();
          setBookResults({
            library: json.library || [],
            external: json.external || [],
          });
        }
      } catch {
        // Silently ignore search errors
      } finally {
        setBookSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [bookQuery, bookSearchOpen, apiBase]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const firstName = data?.studentFirstName || '';

  const getLogDateValue = () => {
    if (logDate === 'today') return today;
    if (logDate === 'yesterday') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toISOString().split('T')[0];
    }
    return customDate;
  };

  const formatSessionDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const resetLogSheet = () => {
    setLogOpen(false);
    setLogError(null);
    setLogSuccess(false);
    setLogDate('today');
    setCustomDate('');
  };

  // ── Log reading submit ──────────────────────────────────────────────────────
  const handleLogReading = async () => {
    setLogSubmitting(true);
    setLogError(null);
    try {
      const body = {
        sessionDate: getLogDateValue(),
        bookId: logBook?.id || null,
        bookTitleManual: logBook?.source === 'external' ? logBook.title : null,
        bookAuthorManual: logBook?.source === 'external' ? logBook.author : null,
      };
      const res = await fetch(`${apiBase}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'Failed to log reading');
      }
      const result = await res.json();
      setLogSuccess(result);
      if (result.newBadges && result.newBadges.length > 0) {
        setNewBadges(result.newBadges);
      }
      // Auto-refresh and close after 2.5s
      setTimeout(async () => {
        resetLogSheet();
        await fetchData();
      }, 2500);
    } catch (err) {
      setLogError(err.message);
    } finally {
      setLogSubmitting(false);
    }
  };

  // ── Book selection ──────────────────────────────────────────────────────────
  const handleSelectBook = (book) => {
    if (searchTarget === 'current') {
      setData((prev) => ({ ...prev, currentBook: book }));
      setLogBook(book);
    } else {
      setLogBook(book);
    }
    setBookSearchOpen(false);
    setBookQuery('');
  };

  const handleOpenBookSearch = (target) => {
    setSearchTarget(target);
    setBookSearchOpen(true);
    setBookQuery('');
    setBookResults({ library: [], external: [] });
  };

  // ── Book Ideas card (shared by the AI + library sections). Tappable → detail
  //    sheet. Card blurb prefers the description ("what it's about") and falls
  //    back to the reason ("why we suggested it"). ──────────────────────────────
  const renderRecCard = (rec, key) => {
    const blurb = rec.description || rec.reason;
    return (
      <Paper
        key={key}
        component="button"
        onClick={() => setDetailRec(rec)}
        elevation={0}
        sx={{
          ...tappableCardSx,
          alignItems: 'flex-start',
          gap: 1.5,
          p: 1.5,
          borderRadius: 3,
          border: `1px solid ${alpha(accent, 0.15)}`,
          bgcolor: 'white',
          transition: 'box-shadow 0.2s ease',
          '&:hover': { boxShadow: `0 4px 16px ${alpha(accent, 0.12)}` },
        }}
      >
        <Box sx={{ flexShrink: 0 }}>
          <BookCover title={rec.title} author={rec.author} isbn={rec.isbn} width={56} height={84} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, color: 'parent.accent', lineHeight: 1.3 }}
          >
            {rec.title}
          </Typography>
          {rec.author && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              by {rec.author}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: blurb ? 0.75 : 0 }}>
            {rec.ageRange && (
              <Chip
                label={`Ages ${rec.ageRange}`}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.65rem',
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
                  height: 20,
                  fontSize: '0.65rem',
                  bgcolor: theme.palette.accent.schoolLight,
                  color: theme.palette.accent.school,
                  fontWeight: 600,
                }}
              />
            )}
          </Box>
          {blurb && (
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                fontSize: '0.85rem',
                lineHeight: 1.4,
                fontStyle: rec.description ? 'normal' : 'italic',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {blurb}
            </Typography>
          )}
          <Typography
            variant="caption"
            sx={{ color: 'parent.accentHover', fontWeight: 600, display: 'block', mt: 0.5 }}
          >
            More about this book →
          </Typography>
        </Box>
      </Paper>
    );
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
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ ...sectionTitleSx, mb: 0.5 }}>
              Book ideas for {firstName}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Great next books for {firstName} to enjoy — ones to borrow from school and ideas to
              discover together.
            </Typography>

            {bookIdeasLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                <CircularProgress sx={{ color: 'parent.accent' }} />
              </Box>
            ) : bookIdeas.ai.length === 0 && bookIdeas.library.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 5, px: 2 }}>
                <Typography sx={{ fontSize: 44, mb: 1 }}>📚</Typography>
                <Typography variant="body2" color="text.secondary">
                  No book ideas just yet. As {firstName} reads more, suggestions will appear here
                  for you to explore together.
                </Typography>
              </Box>
            ) : (
              <>
                {/* Teacher/AI-chosen picks */}
                {bookIdeas.ai.length > 0 && (
                  <Box sx={{ mb: bookIdeas.library.length > 0 ? 3 : 0 }}>
                    <Typography
                      variant="caption"
                      sx={{ ...sectionTitleSx, display: 'block', mb: 1, fontSize: '0.8rem' }}
                    >
                      ✨ Chosen for {firstName}
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      {bookIdeas.ai.map((rec, i) => renderRecCard(rec, `ai-${rec.title}-${i}`))}
                    </Box>
                  </Box>
                )}

                {/* Live matches from the school's own library — borrowable */}
                {bookIdeas.library.length > 0 && (
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{ ...sectionTitleSx, display: 'block', mb: 1, fontSize: '0.8rem' }}
                    >
                      📖 From the school library — ready to borrow
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      {bookIdeas.library.map((rec, i) =>
                        renderRecCard(rec, `lib-${rec.title}-${i}`)
                      )}
                    </Box>
                  </Box>
                )}
              </>
            )}
          </Box>
        )}
      </Box>

      {/* ── Log Reading bottom sheet (Dialog) ────────────────────────────── */}
      <Dialog
        open={logOpen}
        onClose={() => {
          if (!logSubmitting) {
            resetLogSheet();
          }
        }}
        fullWidth
        maxWidth="sm"
        aria-label="Log reading"
        PaperProps={{
          sx: {
            borderRadius: '16px 16px 0 0',
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            m: 0,
            maxWidth: '100% !important',
            width: '100%',
          },
        }}
        sx={{ '& .MuiDialog-container': { alignItems: 'flex-end' } }}
      >
        <DialogContent sx={{ pt: 2, pb: 3, px: 2.5 }}>
          {logSuccess ? (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Typography sx={{ fontSize: 56, mb: 1 }}>🎉</Typography>
              <Typography
                variant="h6"
                sx={{ fontWeight: 700, color: 'parent.accent', fontFamily: NUNITO }}
              >
                Reading logged!
              </Typography>
              <StreakBadge
                streak={logSuccess?.streak?.current || (streak?.current || 0) + 1}
                size="large"
                showLabel
              />
            </Box>
          ) : (
            <>
              <Typography
                variant="h6"
                sx={{ fontWeight: 700, color: 'parent.accent', mb: 2, fontFamily: NUNITO }}
              >
                Log Reading
              </Typography>

              {logError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {logError}
                </Alert>
              )}

              {/* Date selection chips */}
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.75 }}
              >
                When did they read?
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                {[
                  { value: 'today', label: 'Today' },
                  { value: 'yesterday', label: 'Yesterday' },
                  { value: 'custom', label: 'Pick a date' },
                ].map((opt) => (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    onClick={() => setLogDate(opt.value)}
                    sx={{
                      height: 44,
                      borderRadius: '22px',
                      px: 1,
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      bgcolor: logDate === opt.value ? 'parent.accent' : 'transparent',
                      color: logDate === opt.value ? 'white' : 'parent.accent',
                      border: '1.5px solid',
                      borderColor: logDate === opt.value ? 'parent.accent' : 'parent.accentBorder',
                      '&:hover': {
                        bgcolor: logDate === opt.value ? 'parent.accentHover' : alpha(accent, 0.08),
                      },
                    }}
                  />
                ))}
              </Box>

              {logDate === 'custom' && (
                <Box sx={{ mb: 2 }}>
                  <input
                    type="date"
                    max={today}
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    aria-label="Reading date"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: 8,
                      border: `1.5px solid ${accentBorder}`,
                      fontFamily: 'inherit',
                      fontSize: '1rem',
                      color: accent,
                      backgroundColor: surface,
                      outline: 'none',
                    }}
                  />
                </Box>
              )}

              {/* Book selection */}
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.75 }}
              >
                Book
              </Typography>
              <Paper
                component="button"
                onClick={() => handleOpenBookSearch('log')}
                elevation={0}
                sx={{
                  ...tappableCardSx,
                  p: 1.5,
                  mb: 2.5,
                  borderRadius: 2,
                  border: `1.5px solid ${alpha(accent, 0.25)}`,
                  bgcolor: 'parent.surface',
                  gap: 1.5,
                  '&:hover': { borderColor: 'parent.accent' },
                }}
              >
                {logBook ? (
                  <>
                    <BookCover
                      title={logBook.title}
                      author={logBook.author}
                      isbn={logBook.isbn}
                      width={36}
                      height={54}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, color: 'parent.accent' }}
                        noWrap
                      >
                        {logBook.title}
                      </Typography>
                      {logBook.author && (
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {logBook.author}
                        </Typography>
                      )}
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{ color: 'parent.accentHover', fontWeight: 600 }}
                    >
                      Change
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    Tap to choose a book
                  </Typography>
                )}
              </Paper>

              <Button
                fullWidth
                variant="contained"
                size="large"
                onClick={handleLogReading}
                disabled={logSubmitting || (logDate === 'custom' && !customDate)}
                sx={{
                  background: accentGradient,
                  borderRadius: 3,
                  fontWeight: 700,
                  fontFamily: NUNITO,
                  py: 1.5,
                  fontSize: '1rem',
                  boxShadow: `0 4px 16px ${alpha(accent, 0.25)}`,
                  '&:hover': {
                    background: accentGradient,
                    boxShadow: `0 6px 20px ${alpha(accent, 0.35)}`,
                  },
                  '&.Mui-disabled': {
                    background: alpha(accent, 0.25),
                    color: 'white',
                  },
                }}
              >
                {logSubmitting ? <CircularProgress size={22} color="inherit" /> : 'Log Reading'}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Book search bottom sheet ─────────────────────────────────────── */}
      <Dialog
        open={bookSearchOpen}
        onClose={() => {
          setBookSearchOpen(false);
          setBookQuery('');
        }}
        fullWidth
        maxWidth="sm"
        aria-label="Find a book"
        PaperProps={{
          sx: {
            position: 'fixed',
            bottom: 0,
            top: 60,
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
        <DialogContent
          sx={{ pt: 2, pb: 2, px: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          <Typography
            variant="h6"
            sx={{ fontWeight: 700, color: 'parent.accent', mb: 1.5, fontFamily: NUNITO }}
          >
            Find a Book
          </Typography>

          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              autoFocus
              placeholder="Search by title or author"
              value={bookQuery}
              onChange={(e) => setBookQuery(e.target.value)}
              fullWidth
              size="small"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: 'parent.accent' }} fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Button
              variant="outlined"
              onClick={() => setScannerOpen(true)}
              aria-label="Scan a book barcode"
              sx={{
                minWidth: 44,
                px: 1,
                borderColor: 'parent.accentBorder',
                color: 'parent.accent',
                '&:hover': { borderColor: 'parent.accent', bgcolor: alpha(accent, 0.08) },
              }}
            >
              <QrCodeScannerIcon />
            </Button>
          </Box>

          {bookSearchLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} sx={{ color: 'parent.accent' }} />
            </Box>
          )}

          <Box sx={{ overflow: 'auto', flex: 1 }}>
            {/* School Library results */}
            {bookResults.library.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    fontWeight: 700,
                    display: 'block',
                    mb: 0.75,
                    px: 0.5,
                  }}
                >
                  School Library
                </Typography>
                {bookResults.library.map((book) => (
                  <Paper
                    key={book.id}
                    component="button"
                    onClick={() => handleSelectBook(book)}
                    elevation={0}
                    sx={{
                      ...tappableCardSx,
                      p: 1.25,
                      mb: 0.75,
                      borderRadius: 2,
                      border: `1px solid ${alpha(accent, 0.12)}`,
                      bgcolor: 'white',
                      gap: 1.5,
                      '&:hover': { bgcolor: alpha(accent, 0.04) },
                    }}
                  >
                    <BookCover
                      title={book.title}
                      author={book.author}
                      isbn={book.isbn}
                      width={32}
                      height={48}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {book.title}
                      </Typography>
                      {book.author && (
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {book.author}
                        </Typography>
                      )}
                    </Box>
                  </Paper>
                ))}
              </Box>
            )}

            {/* External / other books results */}
            {bookResults.external.length > 0 && (
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    fontWeight: 700,
                    display: 'block',
                    mb: 0.75,
                    px: 0.5,
                  }}
                >
                  Other Books
                </Typography>
                {bookResults.external.map((book, i) => (
                  <Paper
                    key={book.id || i}
                    component="button"
                    onClick={() => handleSelectBook(book)}
                    elevation={0}
                    sx={{
                      ...tappableCardSx,
                      p: 1.25,
                      mb: 0.75,
                      borderRadius: 2,
                      border: `1px solid ${alpha(accent, 0.08)}`,
                      bgcolor: 'white',
                      gap: 1.5,
                      '&:hover': { bgcolor: alpha(accent, 0.04) },
                    }}
                  >
                    {book.coverUrl ? (
                      <Box
                        component="img"
                        src={book.coverUrl}
                        alt=""
                        loading="lazy"
                        sx={{
                          width: 32,
                          height: 48,
                          borderRadius: 1,
                          objectFit: 'cover',
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <Box sx={{ flexShrink: 0 }}>
                        <BookCoverPlaceholder title={book.title} width={32} height={48} />
                      </Box>
                    )}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {book.title}
                      </Typography>
                      {book.author && (
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {book.author}
                        </Typography>
                      )}
                    </Box>
                  </Paper>
                ))}
              </Box>
            )}

            {!bookSearchLoading && !bookQuery.trim() && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ textAlign: 'center', py: 4, px: 2 }}
              >
                Search the school library by title or author, or scan the barcode on the back of the
                book.
              </Typography>
            )}

            {!bookSearchLoading &&
              bookQuery.trim() &&
              bookResults.library.length === 0 &&
              bookResults.external.length === 0 && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ textAlign: 'center', py: 3 }}
                >
                  No books found for &quot;{bookQuery}&quot;
                </Typography>
              )}
          </Box>
        </DialogContent>
      </Dialog>

      {/* ── Book detail bottom sheet ─────────────────────────────────────── */}
      <Dialog
        open={!!detailRec}
        onClose={() => setDetailRec(null)}
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
          {detailRec && (
            <>
              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <Box sx={{ flexShrink: 0 }}>
                  <BookCover
                    title={detailRec.title}
                    author={detailRec.author}
                    isbn={detailRec.isbn}
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
                    {detailRec.title}
                  </Typography>
                  {detailRec.author && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      by {detailRec.author}
                    </Typography>
                  )}
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {detailRec.ageRange && (
                      <Chip
                        label={`Ages ${detailRec.ageRange}`}
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
                    {detailRec.pageCount && (
                      <Chip
                        label={`${detailRec.pageCount} pages`}
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
                    {detailRec.inLibrary && (
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
                  {detailRec.seriesName && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', mt: 0.75 }}
                    >
                      {detailRec.seriesName}
                      {detailRec.seriesNumber ? ` · Book ${detailRec.seriesNumber}` : ''}
                    </Typography>
                  )}
                </Box>
              </Box>

              {detailRec.description && (
                <Box sx={{ mb: 2 }}>
                  <Typography
                    variant="caption"
                    sx={{ ...sectionTitleSx, display: 'block', mb: 0.5, fontSize: '0.8rem' }}
                  >
                    What it&apos;s about
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
                    {detailRec.description}
                  </Typography>
                </Box>
              )}

              {detailRec.reason && (
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
                      {detailRec.reason}
                    </Typography>
                  </Box>
                </Box>
              )}

              {detailRec.genres?.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography
                    variant="caption"
                    sx={{ ...sectionTitleSx, display: 'block', mb: 0.5, fontSize: '0.8rem' }}
                  >
                    Genres
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {detailRec.genres.map((g, i) => (
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

              {detailRec.whereToFind && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {detailRec.whereToFind}
                </Typography>
              )}

              <Button
                fullWidth
                variant="contained"
                onClick={() => setDetailRec(null)}
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

      {/* ── Barcode scanner ────────────────────────────────────────────── */}
      <BarcodeScanner
        open={scannerOpen}
        onScan={(isbn) => {
          setScannerOpen(false);
          setBookQuery(isbn);
        }}
        onClose={() => setScannerOpen(false)}
      />

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
