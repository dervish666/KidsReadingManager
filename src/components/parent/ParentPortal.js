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
import SearchIcon from '@mui/icons-material/Search';
import BookCover from '../BookCover';
import StreakBadge from '../students/StreakBadge';
import GardenHeader from '../badges/GardenHeader';
import BadgeCelebration from '../badges/BadgeCelebration';
import TallyLogo from '../TallyLogo';

/**
 * ParentPortal - Public-facing parent view accessed via QR code token.
 * Renders student reading info and allows parents to log reading sessions.
 * Uses plain fetch() (no auth) — all API calls go to /api/parent/{token}.
 */
const ParentPortal = () => {
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

  // ── Badge celebration state ─────────────────────────────────────────────────
  const [newBadges, setNewBadges] = useState([]);

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

  // ── Book search debounce ────────────────────────────────────────────────────
  useEffect(() => {
    if (!bookSearchOpen || !bookQuery.trim()) {
      setBookResults({ library: [], external: [] });
      return;
    }

    const timer = setTimeout(async () => {
      setBookSearchLoading(true);
      try {
        const res = await fetch(
          `${apiBase}/books?q=${encodeURIComponent(bookQuery.trim())}`
        );
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
  const firstName = data?.student?.name ? data.student.name.split(' ')[0] : '';

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
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  // ── Log reading submit ──────────────────────────────────────────────────────
  const handleLogReading = async () => {
    setLogSubmitting(true);
    setLogError(null);
    try {
      const body = {
        date: getLogDateValue(),
        bookId: logBook?.id || null,
        bookTitle: logBook?.title || null,
        source: 'home',
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
      setLogSuccess(true);
      if (result.newBadges && result.newBadges.length > 0) {
        setNewBadges(result.newBadges);
      }
      // Auto-refresh and close after 2.5s
      setTimeout(async () => {
        setLogOpen(false);
        setLogSuccess(false);
        setLogDate('today');
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
    if (searchTarget === 'log') {
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

  // ── Loading / Error states ──────────────────────────────────────────────────
  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          bgcolor: '#faf8f5',
        }}
      >
        <CircularProgress sx={{ color: '#2d5016' }} />
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
          bgcolor: '#faf8f5',
          minHeight: '100vh',
        }}
      >
        <TallyLogo size={48} color="#2d5016" />
        <Typography
          variant="h6"
          sx={{ mt: 2, color: '#2d5016', fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}
        >
          Tally Reading
        </Typography>
        <Alert severity="error" sx={{ mt: 3, textAlign: 'left' }}>
          {error}
        </Alert>
      </Box>
    );
  }

  const { student, currentBook, sessions = [], badgeCount = 0 } = data || {};

  return (
    <Box sx={{ maxWidth: 480, mx: 'auto', bgcolor: '#faf8f5', minHeight: '100vh', pb: 6 }}>
      {/* ── Header bar ──────────────────────────────────────────────────── */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #2d5016 0%, #4a7c28 100%)',
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
          sx={{ color: 'white', fontWeight: 700, fontFamily: '"Nunito", sans-serif' }}
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
            color: '#2d5016',
            fontFamily: '"Nunito", sans-serif',
            mb: 2.5,
          }}
        >
          {firstName}&apos;s Reading
        </Typography>

        {/* ── Current book card ────────────────────────────────────────── */}
        <Paper
          onClick={() => handleOpenBookSearch('log')}
          elevation={0}
          sx={{
            p: 2,
            mb: 2,
            borderRadius: 3,
            border: '1px solid rgba(45, 80, 22, 0.15)',
            bgcolor: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            cursor: 'pointer',
            transition: 'box-shadow 0.2s ease',
            '&:hover': { boxShadow: '0 4px 16px rgba(45, 80, 22, 0.12)' },
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
                  sx={{ fontWeight: 700, color: '#2d5016', noWrap: true }}
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
                No current book set — tap to select one
              </Typography>
            </Box>
          )}
        </Paper>

        {/* ── Streak + Read Today row ──────────────────────────────────── */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <StreakBadge streak={student?.currentStreak || 0} size="large" showLabel />
          <Button
            variant="contained"
            size="large"
            onClick={() => setLogOpen(true)}
            sx={{
              background: 'linear-gradient(135deg, #2d5016 0%, #4a7c28 100%)',
              borderRadius: 3,
              fontWeight: 700,
              fontFamily: '"Nunito", sans-serif',
              px: 3,
              py: 1.25,
              boxShadow: '0 4px 16px rgba(45, 80, 22, 0.25)',
              '&:hover': {
                background: 'linear-gradient(135deg, #3a6b1e 0%, #5a9232 100%)',
                boxShadow: '0 6px 20px rgba(45, 80, 22, 0.35)',
              },
            }}
          >
            Read Today
          </Button>
        </Box>

        {/* ── Recent sessions ──────────────────────────────────────────── */}
        {sessions.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, color: '#2d5016', mb: 1.5, fontFamily: '"Nunito", sans-serif' }}
            >
              Recent Sessions
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {sessions.slice(0, 10).map((session, i) => (
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
                    border: '1px solid rgba(45, 80, 22, 0.08)',
                  }}
                >
                  {/* Colored dot: green = school, purple = home */}
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: session.sessionType === 'home' ? '#7c5ab8' : '#4a7c28',
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{ flex: 1, color: '#2d3748', fontWeight: 500 }}
                    noWrap
                  >
                    {session.bookTitle || 'Unknown book'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                    {formatSessionDate(session.date)}
                  </Typography>
                  <Chip
                    label={session.sessionType === 'home' ? 'Home' : 'School'}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.65rem',
                      bgcolor:
                        session.sessionType === 'home'
                          ? 'rgba(124, 90, 184, 0.1)'
                          : 'rgba(74, 124, 40, 0.1)',
                      color: session.sessionType === 'home' ? '#7c5ab8' : '#4a7c28',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  />
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* ── Reading Garden ───────────────────────────────────────────── */}
        <Box sx={{ mb: 3 }}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, color: '#2d5016', mb: 1, fontFamily: '"Nunito", sans-serif' }}
          >
            Reading Garden
          </Typography>
          <GardenHeader badgeCount={badgeCount} height={160} />
        </Box>
      </Box>

      {/* ── Log Reading bottom sheet (Dialog) ────────────────────────────── */}
      <Dialog
        open={logOpen}
        onClose={() => {
          if (!logSubmitting) {
            setLogOpen(false);
            setLogError(null);
            setLogSuccess(false);
            setLogDate('today');
          }
        }}
        fullWidth
        maxWidth="sm"
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
                sx={{ fontWeight: 700, color: '#2d5016', fontFamily: '"Nunito", sans-serif' }}
              >
                Reading logged!
              </Typography>
              <StreakBadge
                streak={(student?.currentStreak || 0) + 1}
                size="large"
                showLabel
              />
            </Box>
          ) : (
            <>
              <Typography
                variant="h6"
                sx={{ fontWeight: 700, color: '#2d5016', mb: 2, fontFamily: '"Nunito", sans-serif' }}
              >
                Log Reading
              </Typography>

              {logError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {logError}
                </Alert>
              )}

              {/* Date selection chips */}
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.75 }}>
                When did they read?
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                {[
                  { value: 'today', label: 'Today' },
                  { value: 'yesterday', label: 'Yesterday' },
                  { value: 'custom', label: 'Pick date...' },
                ].map((opt) => (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    onClick={() => setLogDate(opt.value)}
                    sx={{
                      fontWeight: 600,
                      bgcolor: logDate === opt.value ? '#2d5016' : 'transparent',
                      color: logDate === opt.value ? 'white' : '#2d5016',
                      border: '1.5px solid',
                      borderColor: logDate === opt.value ? '#2d5016' : 'rgba(45, 80, 22, 0.35)',
                      '&:hover': { bgcolor: logDate === opt.value ? '#3a6b1e' : 'rgba(45, 80, 22, 0.08)' },
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
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1.5px solid rgba(45, 80, 22, 0.35)',
                      fontFamily: 'inherit',
                      fontSize: '0.9rem',
                      color: '#2d5016',
                      backgroundColor: '#faf8f5',
                      outline: 'none',
                    }}
                  />
                </Box>
              )}

              {/* Book selection */}
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.75 }}>
                Book
              </Typography>
              <Paper
                onClick={() => handleOpenBookSearch('log')}
                elevation={0}
                sx={{
                  p: 1.5,
                  mb: 2.5,
                  borderRadius: 2,
                  border: '1.5px solid rgba(45, 80, 22, 0.25)',
                  bgcolor: '#faf8f5',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  cursor: 'pointer',
                  '&:hover': { borderColor: '#2d5016' },
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
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#2d5016' }} noWrap>
                        {logBook.title}
                      </Typography>
                      {logBook.author && (
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {logBook.author}
                        </Typography>
                      )}
                    </Box>
                    <Typography variant="caption" sx={{ color: '#4a7c28', fontWeight: 600 }}>
                      Change
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    Tap to select a book...
                  </Typography>
                )}
              </Paper>

              <Button
                fullWidth
                variant="contained"
                size="large"
                onClick={handleLogReading}
                disabled={logSubmitting}
                sx={{
                  background: 'linear-gradient(135deg, #2d5016 0%, #4a7c28 100%)',
                  borderRadius: 3,
                  fontWeight: 700,
                  fontFamily: '"Nunito", sans-serif',
                  py: 1.5,
                  fontSize: '1rem',
                  boxShadow: '0 4px 16px rgba(45, 80, 22, 0.25)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #3a6b1e 0%, #5a9232 100%)',
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
        <DialogContent sx={{ pt: 2, pb: 2, px: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Typography
            variant="h6"
            sx={{ fontWeight: 700, color: '#2d5016', mb: 1.5, fontFamily: '"Nunito", sans-serif' }}
          >
            Find a Book
          </Typography>

          <TextField
            autoFocus
            placeholder="Search by title or author..."
            value={bookQuery}
            onChange={(e) => setBookQuery(e.target.value)}
            fullWidth
            size="small"
            sx={{ mb: 2 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#2d5016' }} fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />

          {bookSearchLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} sx={{ color: '#2d5016' }} />
            </Box>
          )}

          <Box sx={{ overflow: 'auto', flex: 1 }}>
            {/* School Library results */}
            {bookResults.library.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.75, px: 0.5 }}
                >
                  School Library
                </Typography>
                {bookResults.library.map((book) => (
                  <Paper
                    key={book.id}
                    onClick={() => handleSelectBook(book)}
                    elevation={0}
                    sx={{
                      p: 1.25,
                      mb: 0.75,
                      borderRadius: 2,
                      border: '1px solid rgba(45, 80, 22, 0.12)',
                      bgcolor: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'rgba(45, 80, 22, 0.04)' },
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
                  sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.75, px: 0.5 }}
                >
                  Other Books
                </Typography>
                {bookResults.external.map((book, i) => (
                  <Paper
                    key={book.id || i}
                    onClick={() => handleSelectBook(book)}
                    elevation={0}
                    sx={{
                      p: 1.25,
                      mb: 0.75,
                      borderRadius: 2,
                      border: '1px solid rgba(45, 80, 22, 0.08)',
                      bgcolor: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'rgba(45, 80, 22, 0.04)' },
                    }}
                  >
                    {/* Grey placeholder for external books */}
                    <Box
                      sx={{
                        width: 32,
                        height: 48,
                        bgcolor: 'rgba(0,0,0,0.08)',
                        borderRadius: 1,
                        flexShrink: 0,
                      }}
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

            {!bookSearchLoading &&
              bookQuery.trim() &&
              bookResults.library.length === 0 &&
              bookResults.external.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                  No books found for &quot;{bookQuery}&quot;
                </Typography>
              )}
          </Box>
        </DialogContent>
      </Dialog>

      {/* ── Badge celebration ────────────────────────────────────────────── */}
      <BadgeCelebration badges={newBadges} onClose={() => setNewBadges([])} />
    </Box>
  );
};

export default ParentPortal;
