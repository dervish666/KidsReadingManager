import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Alert,
  CircularProgress,
  Divider,
  Snackbar,
  LinearProgress,
} from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import StopIcon from '@mui/icons-material/Stop';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { useAuth } from '../contexts/AuthContext';
import { useEnrichmentPolling } from '../hooks/useEnrichmentPolling';

const BookMetadataSettings = () => {
  const { fetchWithAuth } = useAuth();

  // Status state
  const [status, setStatus] = useState(null); // { totalBooks, enrichedBooks, lastJobDate, activeJobId }
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  // Enrichment job state
  const [isRunning, setIsRunning] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  // ── Polling ──────────────────────────────────────────────────────────────────

  const handlePollingComplete = useCallback(() => {
    showSnackbar('Enrichment complete', 'success');
  }, []);

  const handlePollingError = useCallback((msg) => {
    showSnackbar(msg, 'error');
  }, []);

  const handlePollingFinished = useCallback(() => {
    setIsRunning(false);
    loadStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { progress, setProgress, startPolling, stopPolling } = useEnrichmentPolling(fetchWithAuth, {
    onComplete: handlePollingComplete,
    onError: handlePollingError,
    onFinished: handlePollingFinished,
  });

  // ── Load status ───────────────────────────────────────────────────────────────

  const loadStatus = async () => {
    try {
      const res = await fetchWithAuth('/api/metadata/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        return data;
      }
    } catch (err) {
      console.error('Failed to load metadata status', err);
    } finally {
      setIsLoadingStatus(false);
    }
    return null;
  };

  // ── On mount: load status and resume active job if any ───────────────────────

  useEffect(() => {
    const init = async () => {
      const data = await loadStatus();
      if (data?.activeJobId) {
        setIsRunning(true);
        startPolling(data.activeJobId);
      }
    };
    init();

    return () => {
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fill Missing ──────────────────────────────────────────────────────────────

  const handleFillMissing = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setProgress(null);

    try {
      const res = await fetchWithAuth('/api/metadata/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobType: 'fill_missing' }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to start enrichment');
      }

      const data = await res.json();
      setProgress(data);

      if (data.done || data.status === 'completed') {
        setIsRunning(false);
        showSnackbar('Enrichment complete', 'success');
        loadStatus();
        return;
      }

      if (data.jobId) {
        await startPolling(data.jobId);
      } else {
        setIsRunning(false);
        loadStatus();
      }
    } catch (err) {
      setIsRunning(false);
      showSnackbar(err.message || 'Enrichment failed', 'error');
    }
  };

  // ── Stop ──────────────────────────────────────────────────────────────────────

  const handleStop = async () => {
    stopPolling();
    const jobId = progress?.jobId;
    if (jobId) {
      try {
        await fetchWithAuth(`/api/metadata/jobs/${jobId}`, { method: 'DELETE' });
        showSnackbar('Enrichment stopped', 'info');
      } catch (err) {
        console.error('Failed to stop job', err);
      }
    }
    setIsRunning(false);
    setProgress(null);
    loadStatus();
  };

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const formatLastEnriched = () => {
    if (!status?.lastJobDate) return 'never';
    try {
      const date = new Date(status.lastJobDate);
      const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
      if (daysAgo === 0) return 'today';
      if (daysAgo === 1) return '1 day ago';
      return `${daysAgo} days ago`;
    } catch {
      return new Date(status.lastJobDate).toLocaleDateString();
    }
  };

  const progressPercent =
    progress?.totalBooks > 0
      ? Math.round((progress.processedBooks / progress.totalBooks) * 100)
      : 0;

  // ── Render ────────────────────────────────────────────────────────────────────

  if (isLoadingStatus) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <MenuBookIcon color="primary" sx={{ mr: 1 }} />
          <Typography variant="h6" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800 }}>
            Book Metadata
          </Typography>
        </Box>

        {/* Status line */}
        {status && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {status.enrichedBooks ?? 0} of {status.totalBooks ?? 0} books enriched &middot; Last
            enriched: {formatLastEnriched()}
          </Typography>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Fill Missing button */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            startIcon={
              isRunning ? <CircularProgress size={18} color="inherit" /> : <AutoFixHighIcon />
            }
            onClick={handleFillMissing}
            disabled={isRunning}
            sx={{
              textTransform: 'none',
              fontFamily: '"DM Sans", sans-serif',
              fontWeight: 600,
              borderRadius: 2,
            }}
          >
            {isRunning ? 'Running…' : 'Fill Missing'}
          </Button>

          {isRunning && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<StopIcon />}
              onClick={handleStop}
              sx={{
                textTransform: 'none',
                fontFamily: '"DM Sans", sans-serif',
                fontWeight: 600,
                borderRadius: 2,
              }}
            >
              Stop
            </Button>
          )}
        </Box>

        {/* Progress bar */}
        {(isRunning || progress) && (
          <Box
            sx={{
              mt: 3,
              backgroundColor: 'rgba(107, 142, 107, 0.06)',
              borderRadius: 2,
              p: 2,
              border: '1px solid rgba(107, 142, 107, 0.15)',
            }}
          >
            <Typography
              variant="body2"
              sx={{ fontFamily: '"DM Sans", sans-serif', mb: 1, color: 'text.secondary' }}
            >
              {progress?.currentBook
                ? `Processing: ${progress.currentBook}`
                : isRunning
                  ? 'Starting enrichment…'
                  : 'Complete'}
              {progress?.processedBooks != null && progress?.totalBooks != null
                ? ` (${progress.processedBooks}/${progress.totalBooks})`
                : ''}
            </Typography>
            <LinearProgress
              variant={progress?.totalBooks > 0 ? 'determinate' : 'indeterminate'}
              value={progressPercent}
              sx={{ borderRadius: 1, height: 6 }}
            />
            {progress?.totalBooks > 0 && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontFamily: '"DM Sans", sans-serif', mt: 0.5, display: 'block' }}
              >
                {progressPercent}% — {progress.enrichedBooks ?? 0} enriched
                {progress.errorCount > 0 ? `, ${progress.errorCount} errors` : ''}
              </Typography>
            )}
          </Box>
        )}
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          sx={{ borderRadius: 2 }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default BookMetadataSettings;
