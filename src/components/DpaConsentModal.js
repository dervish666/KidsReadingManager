import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Checkbox,
  FormControlLabel,
  Alert,
  CircularProgress,
  Link,
} from '@mui/material';
import GavelIcon from '@mui/icons-material/Gavel';
import { useAppContext } from '../contexts/AppContext';

const DPA_VERSION = '1.0';

const DpaConsentModal = () => {
  const { fetchWithAuth, user, handleLogout } = useAppContext();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Only admins and owners can accept the DPA
  const canAccept = user?.role === 'owner' || user?.role === 'admin';

  useEffect(() => {
    if (!user || !canAccept) {
      setLoading(false);
      return;
    }

    const checkConsent = async () => {
      try {
        const response = await fetchWithAuth('/api/organization/dpa-consent');
        if (response.ok) {
          const data = await response.json();
          // Show modal if no consent or outdated version
          if (!data.consent?.given || data.consent?.version !== DPA_VERSION) {
            setOpen(true);
          }
        }
      } catch {
        // Don't block the app on consent check failure
      } finally {
        setLoading(false);
      }
    };

    checkConsent();
  }, [user, canAccept, fetchWithAuth]);

  const handleAccept = async () => {
    setSubmitting(true);
    setError('');
    try {
      const response = await fetchWithAuth('/api/organization/dpa-consent', {
        method: 'POST',
        body: JSON.stringify({ version: DPA_VERSION }),
      });

      if (!response.ok) {
        throw new Error('Failed to record consent');
      }

      setOpen(false);
    } catch (err) {
      setError('Failed to record consent. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !open) return null;

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <GavelIcon color="primary" />
        <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
          Data Processing Agreement
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Typography variant="body1" paragraph>
          Before using Tally Reading with student data, your school must accept the
          Data Processing Agreement (DPA). This agreement outlines how we process
          personal data in compliance with UK GDPR.
        </Typography>

        <Box sx={{
          p: 2,
          borderRadius: 2,
          backgroundColor: 'rgba(107, 142, 107, 0.06)',
          border: '1px solid rgba(107, 142, 107, 0.2)',
          mb: 2,
        }}>
          <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700 }}>
            Key points:
          </Typography>
          <Typography variant="body2" component="ul" sx={{ pl: 2, mb: 0, '& li': { mb: 0.5 } }}>
            <li>Student data is processed solely for the purpose of tracking reading progress</li>
            <li>Data is stored securely on Cloudflare infrastructure within the UK/EU</li>
            <li>AI recommendations (if enabled) send reading profiles (level, genres, history) to AI providers — student names are never sent</li>
            <li>You can request data export or erasure at any time</li>
            <li>The full DPA and privacy policy are available in your account documentation</li>
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" paragraph>
          Version {DPA_VERSION} — <Link href="/privacy" target="_blank" rel="noopener">View full Privacy Policy</Link>
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        )}

        <FormControlLabel
          control={
            <Checkbox
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              color="primary"
            />
          }
          label={
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              I confirm I have authority to accept this agreement on behalf of my school
            </Typography>
          }
        />
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
        <Button
          onClick={handleLogout}
          variant="outlined"
          color="inherit"
        >
          Decline and Log Out
        </Button>
        <Button
          onClick={handleAccept}
          variant="contained"
          disabled={!confirmed || submitting}
          startIcon={submitting ? <CircularProgress size={18} /> : <GavelIcon />}
        >
          {submitting ? 'Recording...' : 'Accept DPA'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DpaConsentModal;
