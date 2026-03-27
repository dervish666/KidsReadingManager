import React, { useState } from 'react';
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
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useAppContext } from '../contexts/AppContext';

const SupportModal = ({ open, onClose, currentPage }) => {
  const { user, fetchWithAuth } = useAppContext();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [ticketId, setTicketId] = useState(null);

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
        Contact Support
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
            <Box
              sx={{
                backgroundColor: 'rgba(107, 142, 107, 0.08)',
                borderRadius: '10px',
                p: 2,
                mb: 2,
                mt: 1,
              }}
            >
              <Typography
                variant="body2"
                sx={{ fontFamily: '"DM Sans", sans-serif', color: 'text.primary' }}
              >
                Sending as <strong>{user?.name}</strong> ({user?.email})
              </Typography>
            </Box>

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
              autoFocus
            />

            <TextField
              label="How can we help?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              fullWidth
              required
              multiline
              rows={6}
              inputProps={{ maxLength: 5000 }}
              helperText={`${message.length}/5000`}
              disabled={loading}
            />
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
        ) : (
          <>
            <Button
              onClick={handleClose}
              disabled={loading}
              sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 600 }}
            >
              Cancel
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
        )}
      </DialogActions>
    </Dialog>
  );
};

export default SupportModal;
