import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Alert,
  CircularProgress,
  Snackbar,
  Chip,
  Radio,
  RadioGroup,
  FormControlLabel,
  Divider,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useAuth } from '../contexts/AuthContext';

// Stable key for a cluster, independent of member order.
const clusterKey = (cluster) =>
  cluster.books
    .map((b) => b.id)
    .sort()
    .join('|');

const DuplicateBooks = () => {
  const { fetchWithAuth } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [clusters, setClusters] = useState([]);
  const [selection, setSelection] = useState({}); // clusterKey → canonical book id
  const [mergingKey, setMergingKey] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  const showSnackbar = (message, severity = 'info') =>
    setSnackbar({ open: true, message, severity });

  const loadDuplicates = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchWithAuth('/api/books/duplicates');
      if (!res.ok) throw new Error('Failed to scan for duplicates');
      const data = await res.json();
      const found = data.clusters || [];
      setClusters(found);
      setSelection(
        Object.fromEntries(found.map((cl) => [clusterKey(cl), cl.suggestedCanonicalId]))
      );
    } catch (err) {
      showSnackbar(err.message || 'Failed to scan for duplicates', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    loadDuplicates();
  }, [loadDuplicates]);

  const handleMerge = async (cluster) => {
    const key = clusterKey(cluster);
    const canonicalId = selection[key] || cluster.suggestedCanonicalId;
    if (!canonicalId) return;
    const duplicateIds = cluster.books.map((b) => b.id).filter((id) => id !== canonicalId);
    if (duplicateIds.length === 0) return;

    setMergingKey(key);
    try {
      const res = await fetchWithAuth('/api/books/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalId, duplicateIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || 'Merge failed');
      }
      const data = await res.json();
      setClusters((prev) => prev.filter((cl) => clusterKey(cl) !== key));
      showSnackbar(
        `Merged ${data.booksMerged} duplicate${data.booksMerged === 1 ? '' : 's'} — ${data.sessionsRepointed} reading session${data.sessionsRepointed === 1 ? '' : 's'} kept`,
        'success'
      );
    } catch (err) {
      showSnackbar(err.message || 'Merge failed', 'error');
    } finally {
      setMergingKey(null);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ContentCopyIcon color="primary" sx={{ mr: 1 }} />
            <Typography variant="h6" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800 }}>
              Duplicate Books
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadDuplicates}
            sx={{
              textTransform: 'none',
              fontFamily: '"DM Sans", sans-serif',
              fontWeight: 600,
              borderRadius: 2,
            }}
          >
            Rescan
          </Button>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Duplicates in the shared global catalogue. Merging picks one book to keep — every reading
          session, "currently reading" pointer, and school library link from the others is moved
          onto it, and any metadata the survivor is missing is filled in. The duplicates are then
          removed. This affects <strong>every school</strong>, so it's owner-only.
        </Typography>
      </Paper>

      {clusters.length === 0 ? (
        <Alert
          severity="success"
          icon={<CheckCircleIcon />}
          sx={{ borderRadius: 2, fontFamily: '"DM Sans", sans-serif' }}
        >
          No duplicate books found — the catalogue is clean.
        </Alert>
      ) : (
        <>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 2, fontFamily: '"DM Sans", sans-serif' }}
          >
            {clusters.length} duplicate group{clusters.length === 1 ? '' : 's'} found.
          </Typography>

          {clusters.map((cluster) => {
            const key = clusterKey(cluster);
            const selected = selection[key] || cluster.suggestedCanonicalId;
            const isMerging = mergingKey === key;
            return (
              <Paper key={key} sx={{ p: 3, mb: 2, borderRadius: 3 }}>
                <Typography
                  variant="subtitle2"
                  sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, mb: 1 }}
                >
                  Keep one, merge the rest:
                </Typography>
                <RadioGroup
                  value={selected}
                  onChange={(e) => setSelection((prev) => ({ ...prev, [key]: e.target.value }))}
                >
                  {cluster.books.map((book) => (
                    <Box
                      key={book.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1,
                        py: 1,
                        borderBottom: '1px solid rgba(107, 142, 107, 0.1)',
                        '&:last-of-type': { borderBottom: 'none' },
                      }}
                    >
                      <FormControlLabel
                        value={book.id}
                        control={<Radio size="small" />}
                        sx={{ m: 0, alignItems: 'flex-start' }}
                        label={
                          <Box sx={{ ml: 0.5 }}>
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                flexWrap: 'wrap',
                              }}
                            >
                              <Typography
                                variant="body2"
                                sx={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 600 }}
                              >
                                {book.title}
                              </Typography>
                              {book.id === cluster.suggestedCanonicalId && (
                                <Chip
                                  label="Suggested"
                                  color="primary"
                                  size="small"
                                  sx={{ height: 20, fontSize: '0.68rem' }}
                                />
                              )}
                            </Box>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontFamily: '"DM Sans", sans-serif', display: 'block' }}
                            >
                              {book.author || 'Unknown author'}
                              {book.isbn ? ` · ISBN ${book.isbn}` : ''}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5, flexWrap: 'wrap' }}>
                              <Chip
                                label={`${book.sessionCount} session${book.sessionCount === 1 ? '' : 's'}`}
                                size="small"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.68rem' }}
                              />
                              <Chip
                                label={`${book.schoolCount} school${book.schoolCount === 1 ? '' : 's'}`}
                                size="small"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.68rem' }}
                              />
                            </Box>
                          </Box>
                        }
                      />
                    </Box>
                  ))}
                </RadioGroup>

                <Divider sx={{ my: 2 }} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    startIcon={
                      isMerging ? <CircularProgress size={18} color="inherit" /> : <MergeTypeIcon />
                    }
                    onClick={() => handleMerge(cluster)}
                    disabled={isMerging || !selected}
                    sx={{
                      textTransform: 'none',
                      fontFamily: '"DM Sans", sans-serif',
                      fontWeight: 600,
                      borderRadius: 2,
                    }}
                  >
                    {isMerging ? 'Merging…' : `Merge ${cluster.books.length - 1} into selected`}
                  </Button>
                </Box>
              </Paper>
            );
          })}
        </>
      )}

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

export default DuplicateBooks;
