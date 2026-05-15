import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  IconButton,
  Collapse,
  Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExploreOutlinedIcon from '@mui/icons-material/ExploreOutlined';
import { useAuth } from '../contexts/AuthContext';
import { useTourContext } from './tour/TourProvider';

const PAGE_TOUR_MAP = {
  Students: 'students',
  'School Reading': 'session-form',
  'Home Reading': ['home-reading-quick', 'home-reading'],
  Recommend: 'recommendations',
  Stats: 'stats',
};

const HelpBullets = ({ intro, bullets }) => (
  <Box>
    {intro && (
      <Typography
        variant="body2"
        sx={{ color: 'text.secondary', lineHeight: 1.7, mb: bullets ? 1 : 0 }}
      >
        {intro}
      </Typography>
    )}
    {bullets && (
      <Box component="ul" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.5 } }}>
        {bullets.map((b, i) => (
          <Typography
            key={i}
            component="li"
            variant="body2"
            sx={{ color: 'text.secondary', lineHeight: 1.7 }}
          >
            {b}
          </Typography>
        ))}
      </Box>
    )}
  </Box>
);

const PAGE_HELP = {
  Students: (
    <HelpBullets
      intro="The Students page shows everyone in your selected class with their current reading status."
      bullets={[
        'Colour coding: green = read recently, yellow = needs attention, red = overdue. Thresholds are set in Settings.',
        'The Priority Reading List orders students by who needs reading the most — sorted by days since their last session. These students also appear at the top of the School Reading page, so a teacher can plan ahead and hand the device to a colleague who will know exactly who to read with next.',
        'Tap a student card to view their reading history, edit their details, or see badge progress.',
      ]}
    />
  ),
  'School Reading': (
    <HelpBullets
      intro="Record a reading session for any student in a few taps."
      bullets={[
        'Select the student, then optionally search for or scan the book they read.',
        'Use the assessment slider to record how independently they read — from Needing Help to Independent.',
        "Add a note if there's anything worth remembering about the session.",
        "Sessions save immediately and update the student's status and streak.",
      ]}
    />
  ),
  'Home Reading': (
    <HelpBullets
      intro="The Home Reading Register lets you log the whole class at once in a grid view."
      bullets={[
        'Tap a cell to mark a student as read, absent, or multiple reads for that day.',
        "The date range controls let you review or backfill sessions across several days — useful for marking up a week's worth at once.",
        'Daily totals appear in the footer so you can see at a glance how many students read each day.',
      ]}
    />
  ),
  Stats: (
    <HelpBullets
      intro="The Stats tab gives you a class-wide view of reading activity."
      bullets={[
        'Overview: active reader counts, reading days, and session totals with trend indicators.',
        'Frequency: which days of the week your class reads most — useful for spotting patterns.',
        'Streaks: leaderboard showing students with the longest current streaks.',
        "Needs Attention: a list of students who haven't read recently, sorted by urgency.",
      ]}
    />
  ),
  Achievements: (
    <HelpBullets
      intro="Students earn badges automatically as they read — no manual input needed."
      bullets={[
        'Milestones: First Finish (first book), Series Finisher (3+ books by same author).',
        'Volume: Bookworm (books read) and Time Traveller (minutes read), each with four tiers. Targets scale by year group so KS1 and KS2 are measured fairly.',
        'Consistency: Steady Reader (3 days in a week), Week Warrior (every day in a week), Monthly Marvel (4+ days every week for a month).',
        'Exploration: Genre Explorer (3, 5, or 7 genres), Fiction & Fact (both fiction and non-fiction).',
        'Select a class to see the class garden — it grows through Seedling → Sprout → Bloom → Full Garden as your class completes its term goals.',
      ]}
    />
  ),
  Recommend: (
    <HelpBullets
      intro="Recommendations searches your school's own book library to find the best match for a student — no AI required."
      bullets={[
        'Choose a focus mode: Balanced (mix of levels), Consolidation (confidence-building reads at or below level), or Challenge (stretch reads above level).',
        'All results come from books already in your library, so every suggestion is something you actually have on the shelf.',
        "AI suggestions are a separate optional add-on — useful for broader recommendations beyond your library. Schools can bring their own API key or purchase the add-on. Get in touch if you'd like to know more.",
      ]}
    />
  ),
  Books: (
    <HelpBullets
      intro="The book library is shared across your school — books added by any teacher are visible to all."
      bullets={[
        'Add a single book manually, or use the barcode scanner on a phone or tablet to add books by scanning the ISBN.',
        'Admins can bulk import books from a CSV exported from your library management system — a great way to get your full catalogue in quickly. Get in touch if you need help preparing or importing a CSV.',
        'Each book can be tagged with a genre, which powers the Genre Explorer badge and AI recommendations.',
      ]}
    />
  ),
  Settings: (
    <HelpBullets
      intro="Settings control how Tally Reading categorises student reading activity."
      bullets={[
        'Reading Status Durations: how many days before a student moves from green (recently read) to yellow (needs attention) to red (overdue).',
        'Streak Settings: the grace period lets students miss a day without breaking their streak — useful for weekends.',
        "Term Dates: set your school's term dates and half-terms for the academic year. These are used to calculate class goal progress and keep streak thresholds accurate across holidays.",
      ]}
    />
  ),
};

const SupportModal = ({ open, onClose, currentPage }) => {
  const { user, fetchWithAuth } = useAuth();
  const { startTour, isTourAvailable, isTourCompleted } = useTourContext();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [ticketId, setTicketId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const pageHelp = PAGE_HELP[currentPage] || null;
  const tourMapping = PAGE_TOUR_MAP[currentPage];
  const tourCandidates = Array.isArray(tourMapping)
    ? tourMapping
    : tourMapping
      ? [tourMapping]
      : [];
  const tourId = tourCandidates.find((id) => isTourAvailable(id));
  const hasTour = !!tourId;
  const tourCompleted = tourId && isTourCompleted(tourId);

  const handleReplayTour = () => {
    onClose();
    setTimeout(() => tourCandidates.forEach((id) => startTour(id)), 300);
  };

  useEffect(() => {
    if (open) {
      setShowForm(!pageHelp);
    }
  }, [open, currentPage, pageHelp]);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);

    try {
      const response = await fetchWithAuth('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
          pageUrl: currentPage || 'Unknown',
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit support request');
      }

      const data = await response.json();
      setTicketId(data.ticketId);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSubject('');
    setMessage('');
    setError(null);
    setSuccess(false);
    setTicketId(null);
    setShowForm(false);
    onClose();
  };

  const isValid = subject.trim().length > 0 && message.trim().length > 0;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '16px',
          backgroundColor: 'background.paper',
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: '"Nunito", sans-serif',
          fontWeight: 800,
          color: 'text.primary',
          pb: 0,
        }}
      >
        {pageHelp && !showForm && !success ? `${currentPage} help` : 'Get in touch'}
        <IconButton onClick={handleClose} size="small" aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        {success ? (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 56, color: 'primary.main', mb: 2 }} />
            <Typography
              variant="h6"
              sx={{
                fontFamily: '"Nunito", sans-serif',
                fontWeight: 700,
                color: 'text.primary',
                mb: 1,
              }}
            >
              Message sent
            </Typography>
            <Typography
              sx={{ fontFamily: '"DM Sans", sans-serif', color: 'text.secondary', mb: 2 }}
            >
              We'll get back to you as soon as we can.
            </Typography>
            <Typography
              variant="caption"
              sx={{ fontFamily: '"DM Sans", sans-serif', color: 'text.secondary' }}
            >
              Reference: {ticketId?.slice(0, 8)}
            </Typography>
          </Box>
        ) : (
          <>
            {/* Page-specific help content */}
            {pageHelp && <Box sx={{ mb: showForm ? 2.5 : 1 }}>{pageHelp}</Box>}

            {pageHelp && !showForm && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1.5 }}>
                {hasTour && (
                  <Button
                    onClick={handleReplayTour}
                    variant="text"
                    startIcon={<ExploreOutlinedIcon />}
                    sx={{
                      color: tourCompleted ? 'text.secondary' : 'primary.main',
                      textTransform: 'none',
                      fontWeight: 600,
                      px: 0,
                      justifyContent: 'flex-start',
                      '&:hover': { color: 'primary.main', backgroundColor: 'transparent' },
                    }}
                  >
                    {tourCompleted ? 'Replay page tour' : 'Take a tour of this page'}
                  </Button>
                )}
                <Button
                  onClick={() => setShowForm(true)}
                  variant="text"
                  endIcon={<ChevronRightIcon />}
                  sx={{
                    color: 'text.secondary',
                    textTransform: 'none',
                    fontWeight: 600,
                    px: 0,
                    justifyContent: 'flex-start',
                    '&:hover': { color: 'primary.main', backgroundColor: 'transparent' },
                  }}
                >
                  Questions or feedback? Get in touch
                </Button>
              </Box>
            )}

            {/* Contact form */}
            <Collapse in={showForm || !pageHelp}>
              <Box>
                {pageHelp && <Divider sx={{ borderColor: 'rgba(139, 115, 85, 0.12)', mb: 2 }} />}

                <Box
                  sx={{
                    backgroundColor: 'rgba(107, 142, 107, 0.08)',
                    borderRadius: '10px',
                    p: 2,
                    mb: 2,
                    mt: pageHelp ? 0 : 1,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ fontFamily: '"DM Sans", sans-serif', color: 'text.primary' }}
                  >
                    Sending as <strong>{user?.name}</strong> ({user?.email})
                  </Typography>
                </Box>

                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: '"DM Sans", sans-serif',
                    color: 'text.secondary',
                    mb: 2,
                  }}
                >
                  Questions, ideas, or something not working? We'd love to hear from you.
                </Typography>

                {error && (
                  <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                    {error}
                  </Alert>
                )}

                <TextField
                  label="Subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  fullWidth
                  required
                  inputProps={{ maxLength: 200 }}
                  helperText={`${subject.length}/200`}
                  sx={{ mb: 2 }}
                  disabled={loading}
                  autoFocus={showForm}
                />

                <TextField
                  label="How can we help?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  fullWidth
                  required
                  multiline
                  rows={4}
                  inputProps={{ maxLength: 5000 }}
                  helperText={`${message.length}/5000`}
                  disabled={loading}
                />
              </Box>
            </Collapse>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {success ? (
          <Button
            onClick={handleClose}
            variant="outlined"
            sx={{
              color: 'primary.main',
              borderColor: 'rgba(107, 142, 107, 0.3)',
              textTransform: 'none',
              fontWeight: 600,
              '&:hover': {
                borderColor: 'primary.main',
                backgroundColor: 'rgba(107, 142, 107, 0.05)',
              },
            }}
          >
            Close
          </Button>
        ) : showForm || !pageHelp ? (
          <>
            <Button
              onClick={pageHelp ? () => setShowForm(false) : handleClose}
              disabled={loading}
              sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 600 }}
            >
              {pageHelp ? 'Back' : 'Cancel'}
            </Button>
            <Button
              onClick={handleSubmit}
              variant="contained"
              disabled={!isValid || loading}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
              sx={{
                backgroundColor: 'primary.main',
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: '10px',
                px: 3,
                '&:hover': { backgroundColor: 'primary.dark' },
                '&.Mui-disabled': { backgroundColor: 'rgba(107, 142, 107, 0.3)' },
              }}
            >
              {loading ? 'Sending...' : 'Send message'}
            </Button>
          </>
        ) : (
          <Button
            onClick={handleClose}
            sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 600 }}
          >
            Close
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default SupportModal;
