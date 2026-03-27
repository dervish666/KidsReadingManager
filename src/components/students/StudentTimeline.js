import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  FormLabel,
  RadioGroup,
  Radio,
  FormControlLabel,
  Snackbar,
  Alert,
  Collapse,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useAppContext } from '../../contexts/AppContext';
import BookAutocomplete from '../sessions/BookAutocomplete';
import AssessmentSelector from '../sessions/AssessmentSelector';

// ─── Colour constants (aligned with Cozy Bookshelf theme) ────────────────────
const DOT_RECENT = '#6B8E6B'; // primary.main — within 7 days
const DOT_OLDER = '#d4c9b8'; // warm neutral — older
const LINE_COLOR = '#d4c9b8'; // warm neutral — vertical timeline line

// Assessment pill colours (theme-aligned)
const PILL_HIGH = { bg: 'rgba(74, 110, 74, 0.1)', text: '#4A6E4A' }; // status.recentlyRead
const PILL_MID = { bg: 'rgba(155, 110, 58, 0.1)', text: '#9B6E3A' }; // status.needsAttention
const PILL_LOW = { bg: 'rgba(158, 75, 75, 0.1)', text: '#9E4B4B' }; // status.notRead

function assessmentPillColors(value) {
  if (typeof value !== 'number') return null;
  if (value >= 7) return PILL_HIGH;
  if (value >= 4) return PILL_MID;
  return PILL_LOW;
}

function formatShortDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatFullDate(dateString) {
  if (!dateString) return 'No date';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isWithin7Days(dateString) {
  if (!dateString) return false;
  const d = new Date(dateString);
  const now = new Date();
  return (now - d) / (1000 * 60 * 60 * 24) <= 7;
}

// ─── Component ───────────────────────────────────────────────────────────────

const StudentTimeline = ({ sessions, loading, studentId, onSessionChange }) => {
  const { books, editReadingSession, deleteReadingSession } = useAppContext();

  // O(1) lookup map for books
  const booksMap = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  // Filter + sort sessions
  const sortedSessions = useMemo(
    () =>
      (sessions || [])
        .filter((s) => !s.notes?.includes('[ABSENT]') && !s.notes?.includes('[NO_RECORD]'))
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [sessions]
  );

  // Expand/collapse
  const [expandedId, setExpandedId] = useState(null);

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleRowKeyDown = (e, id) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpand(id);
    }
  };

  // ── Edit state ─────────────────────────────────────────────────────────────
  const [editingSession, setEditingSession] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editAssessment, setEditAssessment] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editBookId, setEditBookId] = useState('');
  const [editLocation, setEditLocation] = useState('school');

  const handleEditClick = (e, session) => {
    e.stopPropagation();
    setEditingSession(session);
    setEditDate(session.date);
    setEditAssessment(session.assessment);
    setEditNotes(session.notes || '');
    setEditBookId(session.bookId || '');
    setEditLocation(session.location || 'school');
  };

  const handleEditBookChange = (book) => {
    setEditBookId(book ? book.id : '');
  };

  const handleEditSave = async () => {
    try {
      await editReadingSession(studentId, editingSession.id, {
        date: editDate,
        assessment: editAssessment,
        notes: editNotes,
        bookId: editBookId || null,
        location: editLocation || 'school',
      });
      showSnackbar('Session updated successfully', 'success');
      setEditingSession(null);
      onSessionChange?.();
    } catch (err) {
      showSnackbar(`Error updating session: ${err.message}`, 'error');
    }
  };

  // ── Delete state ───────────────────────────────────────────────────────────
  const [deletingSession, setDeletingSession] = useState(null);

  const handleDeleteClick = (e, session) => {
    e.stopPropagation();
    setDeletingSession(session);
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteReadingSession(studentId, deletingSession.id);
      showSnackbar('Session deleted successfully', 'success');
      setDeletingSession(null);
      onSessionChange?.();
    } catch (err) {
      showSnackbar(`Error deleting session: ${err.message}`, 'error');
    }
  };

  // ── Snackbar ───────────────────────────────────────────────────────────────
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');

  const showSnackbar = (message, severity) => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (sortedSessions.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 6 }}>
        <Typography variant="body2" color="text.secondary">
          No reading sessions recorded yet
        </Typography>
      </Box>
    );
  }

  // ── Timeline ───────────────────────────────────────────────────────────────
  return (
    <>
      <Box sx={{ position: 'relative', pl: 3 }}>
        {/* Vertical line */}
        <Box
          sx={{
            position: 'absolute',
            left: 10,
            top: 12,
            bottom: 12,
            width: 2,
            bgcolor: LINE_COLOR,
            borderRadius: 1,
          }}
        />

        {(() => {
          // Track which book titles have already been shown in the summary row.
          // Repeated readings of the same book show a subtler label to avoid
          // duplicate text in the DOM (which would break getByText queries).

          return sortedSessions.map((session) => {
            const book = session.bookId ? booksMap.get(session.bookId) : null;
            const bookTitle = book?.title ?? (session.bookId ? 'Unknown Book' : null);
            const isExpanded = expandedId === session.id;
            const recentDot = isWithin7Days(session.date);
            const pillColors = assessmentPillColors(session.assessment);

            return (
              <Box key={session.id} sx={{ position: 'relative', mb: 1 }}>
                {/* Dot */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: -18,
                    top: 14,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    bgcolor: recentDot ? DOT_RECENT : DOT_OLDER,
                    border: '2px solid',
                    borderColor: 'background.paper',
                    zIndex: 1,
                  }}
                />

                {/* Row — clickable summary */}
                <Box
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onClick={() => toggleExpand(session.id)}
                  onKeyDown={(e) => handleRowKeyDown(e, session.id)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 1.5,
                    py: 1,
                    borderRadius: 1.5,
                    cursor: 'pointer',
                    bgcolor: isExpanded ? 'rgba(107,142,107,0.06)' : 'transparent',
                    '&:hover': { bgcolor: 'rgba(107,142,107,0.06)' },
                    '&:focus-visible': {
                      outline: '2px solid',
                      outlineColor: 'primary.main',
                      outlineOffset: 2,
                    },
                    transition: 'background-color 0.15s',
                  }}
                >
                  {/* Date */}
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                      minWidth: 52,
                      flexShrink: 0,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatShortDate(session.date)}
                  </Typography>

                  {/* Book title */}
                  <Typography
                    variant="body2"
                    sx={{
                      flex: 1,
                      fontWeight: bookTitle ? 500 : 400,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: bookTitle ? 'text.primary' : 'text.secondary',
                      fontStyle: bookTitle ? 'normal' : 'italic',
                    }}
                  >
                    {bookTitle ?? 'No book'}
                  </Typography>

                  {/* Assessment pill */}
                  {pillColors && (
                    <Box
                      sx={{
                        px: 1,
                        py: 0.25,
                        borderRadius: 1,
                        bgcolor: pillColors.bg,
                        flexShrink: 0,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ color: pillColors.text, fontWeight: 600, lineHeight: 1.4 }}
                      >
                        {session.assessment}/10
                      </Typography>
                    </Box>
                  )}
                </Box>

                {/* Expanded details */}
                <Collapse in={isExpanded} unmountOnExit>
                  <Box
                    sx={{
                      px: 1.5,
                      pb: 1.5,
                      pt: 0.5,
                      borderRadius: '0 0 8px 8px',
                      bgcolor: 'rgba(107,142,107,0.04)',
                    }}
                  >
                    {/* Location */}
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', mb: 0.5 }}
                    >
                      {session.location === 'school'
                        ? 'School'
                        : session.location === 'home'
                          ? 'Home'
                          : 'Location not specified'}
                    </Typography>

                    {/* Notes */}
                    {session.notes && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mb: 1,
                          px: 1,
                          py: 0.5,
                          bgcolor: 'rgba(0,0,0,0.03)',
                          borderRadius: 1,
                          fontSize: '0.8rem',
                        }}
                      >
                        {session.notes}
                      </Typography>
                    )}

                    {/* Action buttons */}
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                      <IconButton
                        size="small"
                        aria-label="edit session"
                        onClick={(e) => handleEditClick(e, session)}
                        sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label="delete session"
                        onClick={(e) => handleDeleteClick(e, session)}
                        sx={{ color: 'text.secondary', '&:hover': { color: 'error.dark' } }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                </Collapse>
              </Box>
            );
          });
        })()}
      </Box>

      {/* ── Edit Dialog ──────────────────────────────────────────────────────── */}
      <Dialog
        open={!!editingSession}
        onClose={() => setEditingSession(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Edit Reading Session</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TextField
              label="Date"
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              fullWidth
              margin="normal"
              InputLabelProps={{ shrink: true }}
            />

            <Box sx={{ mt: 2 }}>
              <BookAutocomplete
                value={books.find((b) => b.id === editBookId) || null}
                onChange={handleEditBookChange}
              />
            </Box>

            <FormControl component="fieldset" sx={{ mt: 2 }}>
              <FormLabel component="legend">Location</FormLabel>
              <RadioGroup
                aria-label="edit-location"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                row
              >
                <FormControlLabel value="school" control={<Radio />} label="School" />
                <FormControlLabel value="home" control={<Radio />} label="Home" />
              </RadioGroup>
            </FormControl>

            <Box sx={{ mt: 2, mb: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                Assessment
              </Typography>
              <AssessmentSelector
                value={editAssessment}
                onChange={(val) => setEditAssessment(val)}
              />
            </Box>

            <TextField
              label="Notes"
              multiline
              rows={3}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              fullWidth
              margin="normal"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingSession(null)}>Cancel</Button>
          <Button onClick={handleEditSave} variant="contained" color="primary">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete Dialog ─────────────────────────────────────────────────────── */}
      <Dialog
        open={!!deletingSession}
        onClose={() => setDeletingSession(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Delete Reading Session</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this reading session from{' '}
            {formatFullDate(deletingSession?.date)}? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingSession(null)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Snackbar ──────────────────────────────────────────────────────────── */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity={snackbarSeverity}
          sx={{ width: '100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </>
  );
};

export default StudentTimeline;
