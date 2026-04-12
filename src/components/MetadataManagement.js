import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Divider,
  Snackbar,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Switch,
  FormControlLabel,
  Slider,
} from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SaveIcon from '@mui/icons-material/Save';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAuth } from '../contexts/AuthContext';
import { useEnrichmentPolling } from '../hooks/useEnrichmentPolling';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PROVIDER_LABELS = {
  hardcover: 'Hardcover',
  googlebooks: 'Google Books',
  openlibrary: 'OpenLibrary',
};

const getKeyStatus = (providerId, config) => {
  if (providerId === 'openlibrary') return { label: 'Free', color: 'success' };
  if (providerId === 'hardcover' && config.hasHardcoverApiKey)
    return { label: 'Key configured', color: 'success' };
  if (providerId === 'googlebooks' && config.hasGoogleBooksApiKey)
    return { label: 'Key configured', color: 'success' };
  return { label: 'No key', color: 'warning' };
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
};

const statusChipProps = (status) => {
  switch (status) {
    case 'completed':
      return {
        label: 'Completed',
        sx: { backgroundColor: 'rgba(74, 110, 74, 0.1)', color: 'status.recentlyRead' },
      };
    case 'running':
      return {
        label: 'Running',
        sx: { backgroundColor: 'rgba(90, 138, 158, 0.12)', color: 'info.main' },
      };
    case 'paused':
      return {
        label: 'Paused',
        sx: { backgroundColor: 'rgba(155, 110, 58, 0.1)', color: 'status.needsAttention' },
      };
    case 'failed':
      return {
        label: 'Failed',
        sx: { backgroundColor: 'rgba(193, 126, 126, 0.12)', color: 'error.main' },
      };
    default:
      return { label: status || 'Unknown', sx: {} };
  }
};

// ─── Main Component ───────────────────────────────────────────────────────────

const MetadataManagement = () => {
  const { fetchWithAuth } = useAuth();

  // ── Config state ──
  const [config, setConfig] = useState({
    providerChain: ['hardcover', 'googlebooks', 'openlibrary'],
    hasHardcoverApiKey: false,
    hasGoogleBooksApiKey: false,
    rateLimitDelayMs: 1500,
    batchSize: 10,
    fetchCovers: true,
  });
  const [hardcoverKey, setHardcoverKey] = useState('');
  const [googleBooksKey, setGoogleBooksKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  // ── Enrichment state ──
  const [schools, setSchools] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState(null); // null = all schools
  const [isEnriching, setIsEnriching] = useState(false);
  const [runInBackground, setRunInBackground] = useState(false);

  // ── Job history state ──
  const [jobs, setJobs] = useState([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);

  // ── Snackbar ──
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  // ── Polling hook ──
  const handlePollingComplete = useCallback(() => {
    showSnackbar('Enrichment complete', 'success');
  }, []);

  const handlePollingError = useCallback((msg) => {
    showSnackbar(msg, 'error');
  }, []);

  const handlePollingFinished = useCallback(() => {
    setIsEnriching(false);
    loadJobs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { progress, setProgress, startPolling, stopPolling } = useEnrichmentPolling(fetchWithAuth, {
    onComplete: handlePollingComplete,
    onError: handlePollingError,
    onFinished: handlePollingFinished,
  });

  // ── Load config on mount ──
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchWithAuth('/api/metadata/config');
        if (res.ok) {
          const data = await res.json();
          setConfig({
            providerChain: data.providerChain || ['hardcover', 'googlebooks', 'openlibrary'],
            hasHardcoverApiKey: data.hasHardcoverApiKey || false,
            hasGoogleBooksApiKey: data.hasGoogleBooksApiKey || false,
            rateLimitDelayMs: data.rateLimitDelayMs ?? 1500,
            batchSize: data.batchSize ?? 10,
            fetchCovers: data.fetchCovers ?? true,
          });
        }
      } catch (err) {
        console.error('Failed to load metadata config', err);
      } finally {
        setIsLoadingConfig(false);
      }
    };
    load();
  }, [fetchWithAuth]);

  // ── Load schools on mount ──
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchWithAuth('/api/organization/all?pageSize=200');
        if (res.ok) {
          const data = await res.json();
          setSchools(Array.isArray(data) ? data : data.organizations || []);
        }
      } catch (err) {
        console.error('Failed to load schools', err);
      }
    };
    load();
  }, [fetchWithAuth]);

  // ── Load jobs ──
  const loadJobs = useCallback(async () => {
    setIsLoadingJobs(true);
    try {
      const res = await fetchWithAuth('/api/metadata/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(Array.isArray(data) ? data : data.jobs || []);
      }
    } catch (err) {
      console.error('Failed to load jobs', err);
    } finally {
      setIsLoadingJobs(false);
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // ── Auto-resume polling for running jobs on mount ──
  useEffect(() => {
    if (jobs.length === 0 || isEnriching) return;
    const runningJob = jobs.find((j) => j.status === 'running' || j.status === 'pending');
    if (runningJob) {
      setIsEnriching(true);
      setProgress({
        jobId: runningJob.id,
        status: runningJob.status,
        totalBooks: runningJob.totalBooks,
        processedBooks: runningJob.processedBooks,
        enrichedBooks: runningJob.enrichedBooks,
        errorCount: runningJob.errorCount,
        done: false,
      });
      startPolling(runningJob.id);
    }
  }, [jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup polling on unmount ──
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  // ─── Section 1: Provider Configuration ────────────────────────────────────

  const moveProvider = (index, direction) => {
    const chain = [...config.providerChain];
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= chain.length) return;
    [chain[index], chain[swapIndex]] = [chain[swapIndex], chain[index]];
    setConfig((prev) => ({ ...prev, providerChain: chain }));
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      const payload = {
        providerChain: config.providerChain,
        rateLimitDelayMs: config.rateLimitDelayMs,
        batchSize: config.batchSize,
        fetchCovers: config.fetchCovers,
      };
      if (hardcoverKey) payload.hardcoverApiKey = hardcoverKey;
      if (googleBooksKey) payload.googleBooksApiKey = googleBooksKey;

      const res = await fetchWithAuth('/api/metadata/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Save failed');
      }

      const data = await res.json();
      setConfig((prev) => ({
        ...prev,
        hasHardcoverApiKey: data.hasHardcoverApiKey ?? prev.hasHardcoverApiKey,
        hasGoogleBooksApiKey: data.hasGoogleBooksApiKey ?? prev.hasGoogleBooksApiKey,
      }));
      setHardcoverKey('');
      setGoogleBooksKey('');
      showSnackbar('Configuration saved', 'success');
    } catch (err) {
      showSnackbar(err.message || 'Failed to save configuration', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Section 2: Global Enrichment ─────────────────────────────────────────

  const handleEnrich = async (jobType) => {
    if (isEnriching) return;
    setIsEnriching(true);
    setProgress(null);

    try {
      const payload = {
        jobType,
        organizationId: selectedSchool || undefined,
        background: runInBackground || undefined,
      };
      const res = await fetchWithAuth('/api/metadata/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to start enrichment');
      }

      const data = await res.json();
      setProgress(data);

      if (data.done || data.status === 'completed') {
        setIsEnriching(false);
        showSnackbar('Enrichment complete', 'success');
        loadJobs();
        return;
      }

      // Background mode: don't poll, the cron will handle it
      if (runInBackground) {
        setIsEnriching(false);
        showSnackbar(
          'Enrichment started in background — check Job History for progress',
          'success'
        );
        loadJobs();
        return;
      }

      if (data.jobId) {
        await startPolling(data.jobId);
      } else {
        setIsEnriching(false);
        loadJobs();
      }
    } catch (err) {
      setIsEnriching(false);
      showSnackbar(err.message || 'Enrichment failed', 'error');
    }
  };

  const handleStop = async () => {
    stopPolling();
    if (progress?.jobId) {
      try {
        await fetchWithAuth(`/api/metadata/jobs/${progress.jobId}`, { method: 'DELETE' });
        showSnackbar('Enrichment stopped', 'info');
      } catch (err) {
        console.error('Failed to stop job', err);
      }
    }
    setIsEnriching(false);
    setProgress(null);
    loadJobs();
  };

  const progressPercent =
    progress?.totalBooks > 0
      ? Math.round((progress.processedBooks / progress.totalBooks) * 100)
      : 0;

  // ─── Render ───────────────────────────────────────────────────────────────

  if (isLoadingConfig) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* ── Section 1: Provider Configuration ─────────────────────────────── */}
      <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <MenuBookIcon color="primary" sx={{ mr: 1 }} />
          <Typography variant="h6" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800 }}>
            Provider Configuration
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Configure the cascade order and API keys for book metadata providers. Tally tries each
          provider in order and merges the best results.
        </Typography>

        {/* Provider chain reorder list */}
        <Typography
          variant="subtitle2"
          sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, mb: 1 }}
        >
          Provider Order
        </Typography>
        <List dense sx={{ mb: 3 }}>
          {config.providerChain.map((providerId, index) => {
            const keyStatus = getKeyStatus(providerId, config);
            return (
              <ListItem
                key={providerId}
                sx={{
                  backgroundColor: 'rgba(107, 142, 107, 0.04)',
                  borderRadius: 2,
                  mb: 1,
                  border: '1px solid rgba(107, 142, 107, 0.12)',
                }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 600 }}
                      >
                        {index + 1}. {PROVIDER_LABELS[providerId] || providerId}
                      </Typography>
                      <Chip
                        label={keyStatus.label}
                        color={keyStatus.color}
                        size="small"
                        sx={{ fontFamily: '"DM Sans", sans-serif', fontSize: '0.72rem' }}
                      />
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton
                    size="small"
                    onClick={() => moveProvider(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${PROVIDER_LABELS[providerId]} up`}
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => moveProvider(index, 1)}
                    disabled={index === config.providerChain.length - 1}
                    aria-label={`Move ${PROVIDER_LABELS[providerId]} down`}
                  >
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            );
          })}
        </List>

        <Divider sx={{ my: 2 }} />

        {/* API keys */}
        <Typography
          variant="subtitle2"
          sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, mb: 2 }}
        >
          API Keys
        </Typography>

        <TextField
          fullWidth
          label="Hardcover API Key"
          type="password"
          value={hardcoverKey}
          onChange={(e) => setHardcoverKey(e.target.value)}
          placeholder={
            config.hasHardcoverApiKey
              ? 'Key configured — enter new key to replace'
              : 'Enter API key'
          }
          helperText="Stored encrypted. Leave blank to keep existing key."
          sx={{ mb: 2 }}
          autoComplete="new-password"
        />

        <TextField
          fullWidth
          label="Google Books API Key"
          type="password"
          value={googleBooksKey}
          onChange={(e) => setGoogleBooksKey(e.target.value)}
          placeholder={
            config.hasGoogleBooksApiKey
              ? 'Key configured — enter new key to replace'
              : 'Enter API key'
          }
          helperText="Stored encrypted. Leave blank to keep existing key."
          sx={{ mb: 3 }}
          autoComplete="new-password"
        />

        <Divider sx={{ my: 2 }} />

        {/* Rate limit and batch size */}
        <Typography
          variant="subtitle2"
          sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, mb: 1 }}
        >
          Rate Limit Delay: {config.rateLimitDelayMs}ms
        </Typography>
        <Slider
          value={config.rateLimitDelayMs}
          onChange={(_, val) => setConfig((prev) => ({ ...prev, rateLimitDelayMs: val }))}
          min={500}
          max={5000}
          step={100}
          marks={[
            { value: 500, label: '0.5s' },
            { value: 1500, label: '1.5s' },
            { value: 3000, label: '3s' },
            { value: 5000, label: '5s' },
          ]}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v}ms`}
          sx={{ mb: 3, color: 'primary.main' }}
        />

        <TextField
          label="Batch Size"
          type="number"
          value={config.batchSize}
          onChange={(e) => {
            const val = Math.max(5, Math.min(50, Number(e.target.value)));
            setConfig((prev) => ({ ...prev, batchSize: val }));
          }}
          inputProps={{ min: 5, max: 50 }}
          helperText="Books processed per batch call (5–50)"
          sx={{ mb: 2, width: 180 }}
        />

        <Box sx={{ mb: 3 }}>
          <FormControlLabel
            control={
              <Switch
                checked={config.fetchCovers}
                onChange={(e) => setConfig((prev) => ({ ...prev, fetchCovers: e.target.checked }))}
                color="primary"
              />
            }
            label={
              <Typography variant="body2" sx={{ fontFamily: '"DM Sans", sans-serif' }}>
                Fetch book covers during enrichment
              </Typography>
            }
          />
        </Box>

        <Button
          variant="contained"
          startIcon={isSaving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
          onClick={handleSaveConfig}
          disabled={isSaving}
          sx={{
            textTransform: 'none',
            fontFamily: '"DM Sans", sans-serif',
            fontWeight: 600,
            borderRadius: 2,
          }}
        >
          {isSaving ? 'Saving…' : 'Save Configuration'}
        </Button>
      </Paper>

      {/* ── Section 2: Global Enrichment ──────────────────────────────────── */}
      <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <RefreshIcon color="primary" sx={{ mr: 1 }} />
          <Typography variant="h6" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800 }}>
            Global Enrichment
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Run metadata enrichment across all books. <strong>Fill Missing</strong> only processes
          books without complete metadata. <strong>Refresh All</strong> re-fetches everything.
        </Typography>

        {/* School selector */}
        <FormControl sx={{ mb: 3, minWidth: 280 }}>
          <InputLabel id="school-select-label">School</InputLabel>
          <Select
            labelId="school-select-label"
            value={selectedSchool ?? ''}
            label="School"
            onChange={(e) => setSelectedSchool(e.target.value || null)}
            disabled={isEnriching}
          >
            <MenuItem value="">All schools</MenuItem>
            {schools.map((school) => (
              <MenuItem key={school.id} value={school.id}>
                {school.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Background toggle + action buttons */}
        <FormControlLabel
          control={
            <Switch
              checked={runInBackground}
              onChange={(e) => setRunInBackground(e.target.checked)}
              disabled={isEnriching}
            />
          }
          label="Run in background"
          sx={{
            mb: 1,
            '& .MuiFormControlLabel-label': {
              fontFamily: '"DM Sans", sans-serif',
              fontSize: '0.9rem',
              color: 'text.secondary',
            },
          }}
        />

        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            startIcon={
              isEnriching ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />
            }
            onClick={() => handleEnrich('fill_missing')}
            disabled={isEnriching}
            sx={{
              textTransform: 'none',
              fontFamily: '"DM Sans", sans-serif',
              fontWeight: 600,
              borderRadius: 2,
            }}
          >
            Fill Missing
          </Button>
          <Button
            variant="outlined"
            startIcon={
              isEnriching ? <CircularProgress size={18} color="primary" /> : <RefreshIcon />
            }
            onClick={() => handleEnrich('refresh_all')}
            disabled={isEnriching}
            sx={{
              textTransform: 'none',
              fontFamily: '"DM Sans", sans-serif',
              fontWeight: 600,
              borderRadius: 2,
            }}
          >
            Refresh All
          </Button>
          {isEnriching && (
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

        {/* Progress display */}
        {(isEnriching || progress) && (
          <Box
            sx={{
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
                : isEnriching
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

      {/* ── Section 3: Job History ─────────────────────────────────────────── */}
      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800 }}>
            Job History
          </Typography>
          <IconButton
            size="small"
            onClick={loadJobs}
            disabled={isLoadingJobs}
            aria-label="Refresh job history"
          >
            {isLoadingJobs ? <CircularProgress size={18} /> : <RefreshIcon />}
          </IconButton>
        </Box>

        {jobs.length === 0 && !isLoadingJobs ? (
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            No enrichment jobs have been run yet.
          </Alert>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      fontFamily: '"Nunito", sans-serif',
                      fontWeight: 700,
                      color: 'text.secondary',
                    }}
                  >
                    Date
                  </TableCell>
                  <TableCell
                    sx={{
                      fontFamily: '"Nunito", sans-serif',
                      fontWeight: 700,
                      color: 'text.secondary',
                    }}
                  >
                    School
                  </TableCell>
                  <TableCell
                    sx={{
                      fontFamily: '"Nunito", sans-serif',
                      fontWeight: 700,
                      color: 'text.secondary',
                    }}
                  >
                    Type
                  </TableCell>
                  <TableCell
                    sx={{
                      fontFamily: '"Nunito", sans-serif',
                      fontWeight: 700,
                      color: 'text.secondary',
                    }}
                  >
                    Status
                  </TableCell>
                  <TableCell
                    sx={{
                      fontFamily: '"Nunito", sans-serif',
                      fontWeight: 700,
                      color: 'text.secondary',
                    }}
                  >
                    Progress
                  </TableCell>
                  <TableCell
                    sx={{
                      fontFamily: '"Nunito", sans-serif',
                      fontWeight: 700,
                      color: 'text.secondary',
                    }}
                  >
                    Enriched
                  </TableCell>
                  <TableCell
                    sx={{
                      fontFamily: '"Nunito", sans-serif',
                      fontWeight: 700,
                      color: 'text.secondary',
                    }}
                  >
                    Errors
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {jobs.map((job) => {
                  const chipProps = statusChipProps(job.status);
                  return (
                    <TableRow key={job.id} sx={{ '&:last-child td': { border: 0 } }}>
                      <TableCell
                        sx={{
                          fontFamily: '"DM Sans", sans-serif',
                          fontSize: '0.8rem',
                          color: 'text.secondary',
                        }}
                      >
                        {formatDate(job.createdAt)}
                      </TableCell>
                      <TableCell sx={{ fontFamily: '"DM Sans", sans-serif', fontSize: '0.85rem' }}>
                        {job.organizationId || 'All schools'}
                      </TableCell>
                      <TableCell
                        sx={{
                          fontFamily: '"DM Sans", sans-serif',
                          fontSize: '0.85rem',
                          textTransform: 'capitalize',
                        }}
                      >
                        {job.jobType || '—'}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={chipProps.label}
                          size="small"
                          sx={{
                            fontFamily: '"DM Sans", sans-serif',
                            fontWeight: 600,
                            fontSize: '0.75rem',
                            ...chipProps.sx,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontFamily: '"DM Sans", sans-serif', fontSize: '0.85rem' }}>
                        {job.processedBooks != null && job.totalBooks != null
                          ? `${job.processedBooks}/${job.totalBooks}`
                          : '—'}
                      </TableCell>
                      <TableCell sx={{ fontFamily: '"DM Sans", sans-serif', fontSize: '0.85rem' }}>
                        {job.enrichedBooks ?? '—'}
                      </TableCell>
                      <TableCell
                        sx={{
                          fontFamily: '"DM Sans", sans-serif',
                          fontSize: '0.85rem',
                          color: job.errorCount > 0 ? 'error.main' : 'text.primary',
                        }}
                      >
                        {job.errorCount ?? 0}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* ── Snackbar ─────────────────────────────────────────────────────── */}
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

export default MetadataManagement;
