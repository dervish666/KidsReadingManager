import React, { useState } from 'react';
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
} from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import BookCover from '../BookCover';
import StreakBadge from '../students/StreakBadge';
import { NUNITO, tappableCardSx } from './parentPortalStyles';

/**
 * "Log Reading" bottom sheet. Owns the date choice, submit and success state;
 * the chosen book stays in ParentPortal (it's set by the sibling book-search
 * sheet and pre-filled from the current book).
 *
 * onLogged(result) fires after a successful POST so the parent can surface
 * badge celebrations and refresh the portal data.
 */
const LogReadingSheet = ({ open, apiBase, logBook, streak, onChooseBook, onClose, onLogged }) => {
  const theme = useTheme();
  const { accent, accentHover, surface, accentBorder } = theme.palette.parent;
  const accentGradient = `linear-gradient(135deg, ${accent} 0%, ${accentHover} 100%)`;

  const today = new Date().toISOString().split('T')[0];

  const [logDate, setLogDate] = useState('today');
  const [customDate, setCustomDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [logError, setLogError] = useState(null);
  const [logSuccess, setLogSuccess] = useState(false);

  const getLogDateValue = () => {
    if (logDate === 'today') return today;
    if (logDate === 'yesterday') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toISOString().split('T')[0];
    }
    return customDate;
  };

  const reset = () => {
    setLogError(null);
    setLogSuccess(false);
    setLogDate('today');
    setCustomDate('');
    onClose();
  };

  const handleLogReading = async () => {
    setSubmitting(true);
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
      // Auto-close after the success beat, then let the parent refresh.
      setTimeout(() => {
        reset();
        onLogged(result);
      }, 2500);
    } catch (err) {
      setLogError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!submitting) {
          reset();
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
              onClick={onChooseBook}
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
                  <Typography variant="caption" sx={{ color: 'parent.accentHover', fontWeight: 600 }}>
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
              disabled={submitting || (logDate === 'custom' && !customDate)}
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
              {submitting ? <CircularProgress size={22} color="inherit" /> : 'Log Reading'}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LogReadingSheet;
