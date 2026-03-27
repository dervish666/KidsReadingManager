import React, { useState, useEffect, useRef } from 'react';
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
  FormControlLabel,
  Checkbox,
  Snackbar,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  List,
  ListItem,
} from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SaveIcon from '@mui/icons-material/Save';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import SyncIcon from '@mui/icons-material/Sync';
import StopIcon from '@mui/icons-material/Stop';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import {
  METADATA_PROVIDERS,
  batchFetchAllMetadata,
  checkAvailability,
  getProviderDisplayName,
  getMetadataConfig,
  validateProviderConfig,
} from '../utils/bookMetadataApi';
import BookCover from './BookCover';

const BookMetadataSettings = () => {
  const { fetchWithAuth, canManageUsers } = useAuth();
  const { settings, updateSettings, loading, books: contextBooks, genres, reloadDataFromServer } = useData();
  const [fullBooks, setFullBooks] = useState(null);
  const books = fullBooks || contextBooks;

  // Fetch full book details when component mounts (context only has minimal data)
  useEffect(() => {
    let cancelled = false;
    fetchWithAuth('/api/books?all=true')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!cancelled && data) {
          setFullBooks(Array.isArray(data) ? data : (data.books || []));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [fetchWithAuth]);
  const [provider, setProvider] = useState(METADATA_PROVIDERS.OPEN_LIBRARY);
  const [googleBooksApiKey, setGoogleBooksApiKey] = useState('');
  const [hardcoverApiKey, setHardcoverApiKey] = useState('');
  const [batchSize, setBatchSize] = useState(50);
  const [speedPreset, setSpeedPreset] = useState('normal');
  const [autoFallback, setAutoFallback] = useState(true);
  const [saveStatus, setSaveStatus] = useState(null); // 'success', 'error', or null
  const [isSaving, setIsSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  // Fill Missing state
  const [isFilling, setIsFilling] = useState(false);
  const [fillProgress, setFillProgress] = useState({ current: 0, total: 0, book: '' });

  // Refresh All state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState({ current: 0, total: 0, book: '' });
  const [refreshResults, setRefreshResults] = useState([]);
  const [showRefreshReview, setShowRefreshReview] = useState(false);

  // Batch control state
  const batchAbortRef = useRef(null);
  const attemptedBookIdsRef = useRef(new Set());
  const [refreshedBookIds, setRefreshedBookIds] = useState(new Set());

  // Track whether API keys exist on the server (never returned in full)
  const [hasStoredHardcoverKey, setHasStoredHardcoverKey] = useState(false);
  const [hasStoredGoogleKey, setHasStoredGoogleKey] = useState(false);

  // Load existing settings
  useEffect(() => {
    if (settings?.bookMetadata) {
      setProvider(settings.bookMetadata.provider || METADATA_PROVIDERS.OPEN_LIBRARY);
      // API keys are never returned by the API — use boolean flags
      setHasStoredGoogleKey(Boolean(settings.bookMetadata.hasGoogleBooksApiKey));
      setGoogleBooksApiKey('');
      setHasStoredHardcoverKey(Boolean(settings.bookMetadata.hasHardcoverApiKey));
      setHardcoverApiKey('');
      setBatchSize(settings.bookMetadata.batchSize || 50);
      setSpeedPreset(settings.bookMetadata.speedPreset || 'normal');
      setAutoFallback(settings.bookMetadata.autoFallback !== false);
    }
  }, [settings]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);

    try {
      const bookMetadata = {
        provider,
        batchSize,
        speedPreset,
        autoFallback
      };

      // Only send API keys if the user typed a new value.
      // Otherwise pass boolean flag so the backend preserves the existing key.
      if (googleBooksApiKey.trim()) {
        bookMetadata.googleBooksApiKey = googleBooksApiKey;
      } else {
        bookMetadata.hasGoogleBooksApiKey = hasStoredGoogleKey;
      }

      if (hardcoverApiKey.trim()) {
        bookMetadata.hardcoverApiKey = hardcoverApiKey;
      } else {
        bookMetadata.hasHardcoverApiKey = hasStoredHardcoverKey;
      }

      const newSettings = { ...settings, bookMetadata };
      await updateSettings(newSettings);
      setSaveStatus('success');
    } catch (error) {
      console.error('Error saving book metadata settings:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleProviderChange = (e) => {
    setProvider(e.target.value);
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const handleStopBatch = () => {
    if (batchAbortRef.current) {
      batchAbortRef.current.abort();
    }
  };

  // Fill Missing: auto-fill gaps (author, description, genres) in one pass
  const handleFillMissing = async () => {
    // Find books with any missing data, excluding already-attempted books
    const booksWithGaps = books.filter(book => {
      if (attemptedBookIdsRef.current.has(book.id)) return false;
      const authorMissing = !book.author || book.author.trim().toLowerCase() === 'unknown' || !book.author.trim();
      const descriptionMissing = !book.description || !book.description.trim();
      const genresMissing = !book.genreIds || book.genreIds.length === 0;
      const isbnMissing = !book.isbn;
      const pageCountMissing = !book.pageCount;
      const publicationYearMissing = !book.publicationYear;
      const seriesNameMissing = !book.seriesName;
      return authorMissing || descriptionMissing || genresMissing || isbnMissing || pageCountMissing || publicationYearMissing || seriesNameMissing;
    });

    if (booksWithGaps.length === 0) {
      const attempted = attemptedBookIdsRef.current.size;
      const message = attempted > 0
        ? `All remaining books already attempted (${attempted} previously tried). Reload the page to reset and try again.`
        : 'All books already have complete metadata!';
      setSnackbar({ open: true, message, severity: 'info' });
      return;
    }

    const configValidation = validateProviderConfig(settings);
    if (!configValidation.valid) {
      setSnackbar({ open: true, message: configValidation.error, severity: 'error' });
      return;
    }

    const providerName = getProviderDisplayName(settings);
    const isAvailable = await checkAvailability(settings, 3000);
    if (!isAvailable) {
      setSnackbar({ open: true, message: `${providerName} is currently unavailable. Please try again later.`, severity: 'error' });
      return;
    }

    setIsFilling(true);
    const controller = new AbortController();
    batchAbortRef.current = controller;
    setFillProgress({ current: 0, total: booksWithGaps.length, book: '', overallTotal: booksWithGaps.length });

    // Build genre name -> ID map once before batch starts
    const genreNameToId = {};
    for (const genre of genres) {
      genreNameToId[genre.name.toLowerCase()] = genre.id;
    }

    // Counters updated per-book inside onBookResult, read by onProgress
    let authorsUpdated = 0, descriptionsUpdated = 0, genresUpdated = 0, isbnsUpdated = 0, pageCountsUpdated = 0, yearsUpdated = 0, seriesUpdated = 0, errorCount = 0;
    let booksProcessed = 0;

    try {
      const results = await batchFetchAllMetadata(booksWithGaps, settings, (progress) => {
        setFillProgress({
          ...progress,
          counts: { authorsUpdated, descriptionsUpdated, genresUpdated, isbnsUpdated, pageCountsUpdated, yearsUpdated, seriesUpdated, errorCount }
        });
      }, {
        signal: controller.signal,
        batchSize: booksWithGaps.length,
        onBookResult: async (result) => {
          const book = result.book;
          const updates = {};
          let hasUpdate = false;

          // Fill author if missing
          const authorMissing = !book.author || book.author.trim().toLowerCase() === 'unknown' || !book.author.trim();
          if (authorMissing && result.foundAuthor) {
            updates.author = result.foundAuthor;
            hasUpdate = true;
            authorsUpdated++;
          }

          // Fill description if missing
          if ((!book.description || !book.description.trim()) && result.foundDescription) {
            updates.description = result.foundDescription;
            hasUpdate = true;
            descriptionsUpdated++;
          }

          // Fill genres if missing
          if ((!book.genreIds || book.genreIds.length === 0) && result.foundGenres && result.foundGenres.length > 0) {
            for (const genreName of result.foundGenres) {
              if (!genreNameToId[genreName.toLowerCase()]) {
                try {
                  const response = await fetchWithAuth('/api/genres', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: genreName }),
                  });
                  if (response.ok) {
                    const newGenre = await response.json();
                    genreNameToId[genreName.toLowerCase()] = newGenre.id;
                  }
                } catch (e) { /* continue */ }
              }
            }

            const genreIds = result.foundGenres
              .map(name => genreNameToId[name.toLowerCase()])
              .filter(Boolean);

            if (genreIds.length > 0) {
              updates.genreIds = genreIds;
              hasUpdate = true;
              genresUpdated++;
            }
          }

          // Fill ISBN if missing
          if (!book.isbn && result.foundIsbn) {
            updates.isbn = result.foundIsbn;
            hasUpdate = true;
            isbnsUpdated++;
          }

          // Fill page count if missing
          if (!book.pageCount && result.foundPageCount) {
            updates.pageCount = result.foundPageCount;
            hasUpdate = true;
            pageCountsUpdated++;
          }

          // Fill publication year if missing
          if (!book.publicationYear && result.foundPublicationYear) {
            updates.publicationYear = result.foundPublicationYear;
            hasUpdate = true;
            yearsUpdated++;
          }

          // Fill series if missing
          if (!book.seriesName && result.foundSeriesName) {
            updates.seriesName = result.foundSeriesName;
            if (result.foundSeriesNumber != null) {
              updates.seriesNumber = result.foundSeriesNumber;
            }
            hasUpdate = true;
            seriesUpdated++;
          }

          if (hasUpdate) {
            try {
              const response = await fetchWithAuth(`/api/books/${book.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...book, ...updates }),
              });
              if (!response.ok) errorCount++;
            } catch (e) {
              errorCount++;
            }
          }

          booksProcessed++;
          attemptedBookIdsRef.current.add(book.id);
        }
      });

      await reloadDataFromServer();

      const parts = [];
      if (authorsUpdated > 0) parts.push(`${authorsUpdated} authors`);
      if (descriptionsUpdated > 0) parts.push(`${descriptionsUpdated} descriptions`);
      if (genresUpdated > 0) parts.push(`${genresUpdated} genres`);
      if (isbnsUpdated > 0) parts.push(`${isbnsUpdated} ISBNs`);
      if (pageCountsUpdated > 0) parts.push(`${pageCountsUpdated} page counts`);
      if (yearsUpdated > 0) parts.push(`${yearsUpdated} years`);
      if (seriesUpdated > 0) parts.push(`${seriesUpdated} series`);

      const totalUpdated = authorsUpdated + descriptionsUpdated + genresUpdated + isbnsUpdated + pageCountsUpdated + yearsUpdated + seriesUpdated;
      const processed = results.length;
      const remaining = booksWithGaps.length - processed;
      let message = totalUpdated > 0
        ? `Updated ${totalUpdated} fields (${parts.join(', ')})${errorCount > 0 ? `, ${errorCount} errors` : ''}`
        : 'No new metadata found for books with gaps';

      if (remaining > 0) {
        message += ` — ${remaining} books remaining, run again to continue`;
      }

      setSnackbar({ open: true, message, severity: totalUpdated > 0 ? 'success' : 'warning' });
    } catch (error) {
      setSnackbar({ open: true, message: `Fill missing failed: ${error.message}`, severity: 'error' });
    } finally {
      setIsFilling(false);
      batchAbortRef.current = null;
    }
  };

  // Refresh All: fetch metadata for all books, show diff review before applying
  const handleRefreshAll = async () => {
    if (books.length === 0) {
      setSnackbar({ open: true, message: 'No books to refresh', severity: 'info' });
      return;
    }

    const configValidation = validateProviderConfig(settings);
    if (!configValidation.valid) {
      setSnackbar({ open: true, message: configValidation.error, severity: 'error' });
      return;
    }

    const providerName = getProviderDisplayName(settings);
    const isAvailable = await checkAvailability(settings, 3000);
    if (!isAvailable) {
      setSnackbar({ open: true, message: `${providerName} is currently unavailable. Please try again later.`, severity: 'error' });
      return;
    }

    // Filter out already-refreshed books for resume capability
    const booksToRefresh = books.filter(b => !refreshedBookIds.has(b.id));
    if (booksToRefresh.length === 0) {
      setSnackbar({ open: true, message: 'All books already refreshed in this session', severity: 'info' });
      return;
    }

    setIsRefreshing(true);
    const config = getMetadataConfig(settings);
    const controller = new AbortController();
    batchAbortRef.current = controller;
    setRefreshProgress({ current: 0, total: Math.min(booksToRefresh.length, config.batchSize), book: '', overallTotal: booksToRefresh.length });

    try {
      const results = await batchFetchAllMetadata(booksToRefresh, settings, (progress) => {
        setRefreshProgress(progress);
      }, { signal: controller.signal });

      // Track refreshed book IDs for resume
      const newRefreshedIds = new Set(refreshedBookIds);
      for (const r of results) {
        if (r.book?.id) newRefreshedIds.add(r.book.id);
      }
      setRefreshedBookIds(newRefreshedIds);

      // Build diff: compare fetched vs existing, only show changes
      const diffs = [];
      for (const result of results) {
        const book = result.book;
        const changes = [];

        // Author diff
        const currentAuthor = (book.author || '').trim();
        const newAuthor = (result.foundAuthor || '').trim();
        if (newAuthor && newAuthor.toLowerCase() !== currentAuthor.toLowerCase()) {
          changes.push({ field: 'author', oldValue: currentAuthor || '(empty)', newValue: newAuthor, checked: true });
        }

        // Description diff
        const currentDesc = (book.description || '').trim();
        const newDesc = (result.foundDescription || '').trim();
        if (newDesc && newDesc !== currentDesc) {
          changes.push({ field: 'description', oldValue: currentDesc || '(empty)', newValue: newDesc, checked: true });
        }

        // Genres diff
        const currentGenreIds = book.genreIds || [];
        if (result.foundGenres && result.foundGenres.length > 0) {
          const currentGenreNames = currentGenreIds
            .map(id => genres.find(g => g.id === id)?.name?.toLowerCase())
            .filter(Boolean);
          const newGenreNames = result.foundGenres.map(g => g.toLowerCase());
          const hasNewGenres = newGenreNames.some(g => !currentGenreNames.includes(g));
          if (hasNewGenres) {
            changes.push({
              field: 'genres',
              oldValue: currentGenreIds.length > 0
                ? currentGenreIds.map(id => genres.find(g => g.id === id)?.name || 'Unknown').join(', ')
                : '(none)',
              newValue: result.foundGenres.join(', '),
              newGenres: result.foundGenres,
              checked: true
            });
          }
        }

        // ISBN diff
        if (result.foundIsbn && result.foundIsbn !== book.isbn) {
          changes.push({ field: 'isbn', oldValue: book.isbn || '(empty)', newValue: result.foundIsbn, checked: true });
        }

        // Page count diff
        if (result.foundPageCount && result.foundPageCount !== book.pageCount) {
          changes.push({ field: 'pageCount', oldValue: book.pageCount ? String(book.pageCount) : '(empty)', newValue: String(result.foundPageCount), checked: true });
        }

        // Publication year diff
        if (result.foundPublicationYear && result.foundPublicationYear !== book.publicationYear) {
          changes.push({ field: 'publicationYear', oldValue: book.publicationYear ? String(book.publicationYear) : '(empty)', newValue: String(result.foundPublicationYear), checked: true });
        }

        // Series name diff
        if (result.foundSeriesName && result.foundSeriesName !== book.seriesName) {
          changes.push({ field: 'seriesName', oldValue: book.seriesName || '(empty)', newValue: result.foundSeriesName, checked: true });
        }

        // Series number diff
        if (result.foundSeriesNumber != null && result.foundSeriesNumber !== book.seriesNumber) {
          changes.push({ field: 'seriesNumber', oldValue: book.seriesNumber != null ? String(book.seriesNumber) : '(empty)', newValue: String(result.foundSeriesNumber), checked: true });
        }

        if (changes.length > 0) {
          diffs.push({ book, changes });
        }
      }

      setRefreshResults(diffs);
      setIsRefreshing(false);
      setShowRefreshReview(true);

      if (diffs.length === 0) {
        setSnackbar({ open: true, message: 'All books are already up to date!', severity: 'info' });
      }
    } catch (error) {
      setIsRefreshing(false);
      batchAbortRef.current = null;
      setSnackbar({ open: true, message: `Refresh failed: ${error.message}`, severity: 'error' });
    }
  };

  const handleApplyRefreshUpdates = async () => {
    let updateCount = 0;
    let errorCount = 0;

    // Build genre name -> ID map
    const genreNameToId = {};
    for (const genre of genres) {
      genreNameToId[genre.name.toLowerCase()] = genre.id;
    }

    for (const diff of refreshResults) {
      const checkedChanges = diff.changes.filter(c => c.checked);
      if (checkedChanges.length === 0) continue;

      const updates = { ...diff.book };

      for (const change of checkedChanges) {
        if (change.field === 'author') {
          updates.author = change.newValue;
        } else if (change.field === 'description') {
          updates.description = change.newValue;
        } else if (change.field === 'isbn') {
          updates.isbn = change.newValue;
        } else if (change.field === 'pageCount') {
          updates.pageCount = parseInt(change.newValue, 10);
        } else if (change.field === 'publicationYear') {
          updates.publicationYear = parseInt(change.newValue, 10);
        } else if (change.field === 'seriesName') {
          updates.seriesName = change.newValue;
        } else if (change.field === 'seriesNumber') {
          updates.seriesNumber = parseInt(change.newValue, 10);
        } else if (change.field === 'genres' && change.newGenres) {
          // Create missing genres
          for (const genreName of change.newGenres) {
            if (!genreNameToId[genreName.toLowerCase()]) {
              try {
                const response = await fetchWithAuth('/api/genres', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: genreName }),
                });
                if (response.ok) {
                  const newGenre = await response.json();
                  genreNameToId[genreName.toLowerCase()] = newGenre.id;
                }
              } catch (e) { /* continue */ }
            }
          }
          const genreIds = change.newGenres
            .map(name => genreNameToId[name.toLowerCase()])
            .filter(Boolean);
          if (genreIds.length > 0) {
            updates.genreIds = genreIds;
          }
        }
      }

      try {
        const response = await fetchWithAuth(`/api/books/${diff.book.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        if (response.ok) updateCount++;
        else errorCount++;
      } catch (e) {
        errorCount++;
      }
    }

    await reloadDataFromServer();
    setShowRefreshReview(false);
    setRefreshResults([]);
    setRefreshedBookIds(new Set());

    setSnackbar({
      open: true,
      message: `Applied changes to ${updateCount} books${errorCount > 0 ? `, ${errorCount} errors` : ''}`,
      severity: errorCount > 0 ? 'warning' : 'success'
    });
  };

  const handleToggleRefreshChange = (bookIndex, changeIndex) => {
    setRefreshResults(prev => prev.map((diff, bi) => {
      if (bi !== bookIndex) return diff;
      return {
        ...diff,
        changes: diff.changes.map((change, ci) => {
          if (ci !== changeIndex) return change;
          return { ...change, checked: !change.checked };
        })
      };
    }));
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const showApiKeyField = provider === METADATA_PROVIDERS.GOOGLE_BOOKS;
  const isGoogleBooksWithoutKey = provider === METADATA_PROVIDERS.GOOGLE_BOOKS && !googleBooksApiKey.trim() && !hasStoredGoogleKey;
  const showHardcoverApiKeyField = provider === METADATA_PROVIDERS.HARDCOVER;
  const isHardcoverWithoutKey = provider === METADATA_PROVIDERS.HARDCOVER && !hardcoverApiKey.trim() && !hasStoredHardcoverKey;

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <MenuBookIcon color="primary" sx={{ mr: 1 }} />
          <Typography variant="h6">Book Metadata Settings</Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" paragraph>
          Configure the service used for fetching book metadata (authors, descriptions, genres, cover images).
          Choose between Open Library (free, no API key required), Google Books (requires API key, often has more comprehensive data), or Hardcover (requires API key, best series data).
        </Typography>

        <Divider sx={{ my: 3 }} />

        {saveStatus === 'success' && (
          <Alert severity="success" sx={{ mb: 3 }}>
            Settings saved successfully!
          </Alert>
        )}

        {saveStatus === 'error' && (
          <Alert severity="error" sx={{ mb: 3 }}>
            Failed to save settings. Please try again.
          </Alert>
        )}

        {isGoogleBooksWithoutKey && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            Google Books API requires an API key. Please enter your API key below or switch to Open Library.
          </Alert>
        )}

        {isHardcoverWithoutKey && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            Hardcover requires an API key. Please enter your API key below or switch to Open Library.
          </Alert>
        )}

        <Box component="form" noValidate autoComplete="off">
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel id="metadata-provider-label">Metadata Provider</InputLabel>
            <Select
              labelId="metadata-provider-label"
              value={provider}
              label="Metadata Provider"
              onChange={handleProviderChange}
            >
              <MenuItem value={METADATA_PROVIDERS.OPEN_LIBRARY}>
                Open Library (Free, no API key)
              </MenuItem>
              <MenuItem value={METADATA_PROVIDERS.GOOGLE_BOOKS}>
                Google Books (Requires API key)
              </MenuItem>
              <MenuItem value={METADATA_PROVIDERS.HARDCOVER}>
                Hardcover (Requires API key, best series data)
              </MenuItem>
            </Select>
          </FormControl>

          {showApiKeyField && (
            <TextField
              fullWidth
              label="Google Books API Key"
              type="password"
              value={googleBooksApiKey}
              onChange={(e) => setGoogleBooksApiKey(e.target.value)}
              placeholder={hasStoredGoogleKey ? 'API key configured (enter new value to change)' : ''}
              helperText="Your API key is stored securely. Get one from the Google Cloud Console."
              sx={{ mb: 3 }}
              error={isGoogleBooksWithoutKey}
            />
          )}

          {showHardcoverApiKeyField && (
            <TextField
              fullWidth
              label="Hardcover API Key"
              type="password"
              value={hardcoverApiKey}
              onChange={(e) => setHardcoverApiKey(e.target.value)}
              placeholder={hasStoredHardcoverKey ? 'API key configured (enter new value to change)' : ''}
              helperText={hasStoredHardcoverKey && !hardcoverApiKey.trim()
                ? 'API key is securely stored. Enter a new value to change it.'
                : 'Get your API key from hardcover.app/account/api'}
              sx={{ mb: 3 }}
              error={isHardcoverWithoutKey}
            />
          )}

          <Divider sx={{ my: 3 }} />

          <Typography variant="subtitle2" gutterBottom>
            Batch Processing Settings
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Configure how Fill Missing and Refresh All process books.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            <TextField
              label="Batch Size"
              type="number"
              value={batchSize}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 10 && val <= 500) setBatchSize(val);
              }}
              helperText="Books per run (10–500). Run again to continue."
              sx={{ width: 160 }}
              inputProps={{ min: 10, max: 500 }}
              size="small"
            />

            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="speed-preset-label">Processing Speed</InputLabel>
              <Select
                labelId="speed-preset-label"
                value={speedPreset}
                label="Processing Speed"
                onChange={(e) => setSpeedPreset(e.target.value)}
              >
                <MenuItem value="careful">Careful (2s delay)</MenuItem>
                <MenuItem value="normal">Normal (1s delay)</MenuItem>
                <MenuItem value="fast">Fast (500ms delay)</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <FormControlLabel
            control={
              <Checkbox
                checked={autoFallback}
                onChange={(e) => setAutoFallback(e.target.checked)}
              />
            }
            label="Auto-switch to Open Library when rate limited"
            sx={{ mb: 3 }}
          />

          <Box sx={{ mb: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              Provider Comparison:
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Open Library:</strong> Free, community-driven, good for classic and popular books. May have gaps in newer or niche titles.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              <strong>Google Books:</strong> Comprehensive database, excellent for newer releases and detailed metadata. Requires API key (free tier available with limits).
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              <strong>Hardcover:</strong> Curated community database with excellent series data. Requires API key (free). Falls back to Open Library when no match found.
            </Typography>
          </Box>

          <Button
            variant="contained"
            startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
            onClick={handleSave}
            disabled={isSaving || isGoogleBooksWithoutKey || isHardcoverWithoutKey}
          >
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </Box>
      </Paper>

      {/* Bulk Metadata Operations — admin/owner only */}
      {canManageUsers && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Bulk Metadata Operations
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            These operations query the metadata provider for every book in your library. They may take a while for large collections.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={isFilling ? <CircularProgress size={16} /> : <AutoFixHighIcon />}
              onClick={handleFillMissing}
              disabled={books.length === 0 || isFilling || isRefreshing}
            >
              Fill Missing ({books.length} books)
            </Button>

            <Button
              variant="outlined"
              startIcon={isRefreshing ? <CircularProgress size={16} /> : <SyncIcon />}
              onClick={handleRefreshAll}
              disabled={books.length === 0 || isFilling || isRefreshing}
            >
              {refreshedBookIds.size > 0
                ? `Continue Refresh (${books.length - refreshedBookIds.size} remaining)`
                : `Refresh All (${books.length} books)`}
            </Button>
          </Box>

          {/* Progress bar */}
          {(isFilling || isRefreshing) && (
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="body2" sx={{ flex: 1 }}>
                  {isFilling ? 'Filling missing data' : 'Refreshing all books'}: {(isFilling ? fillProgress : refreshProgress).current}/{(isFilling ? fillProgress : refreshProgress).total}
                  {(isFilling ? fillProgress : refreshProgress).overallTotal > (isFilling ? fillProgress : refreshProgress).total &&
                    ` (${(isFilling ? fillProgress : refreshProgress).overallTotal} total)`}
                </Typography>
                <Button
                  variant="outlined"
                  color="warning"
                  size="small"
                  startIcon={<StopIcon />}
                  onClick={handleStopBatch}
                >
                  Stop
                </Button>
              </Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Current: {(isFilling ? fillProgress : refreshProgress).book}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={(() => {
                  const p = isFilling ? fillProgress : refreshProgress;
                  return p.total > 0 ? (p.current / p.total) * 100 : 0;
                })()}
                sx={{ mb: 1 }}
              />
              {isFilling && fillProgress.counts && (() => {
                const c = fillProgress.counts;
                const total = c.authorsUpdated + c.descriptionsUpdated + c.genresUpdated + c.isbnsUpdated + c.pageCountsUpdated + c.yearsUpdated + c.seriesUpdated;
                if (total === 0) return null;
                const parts = [
                  c.authorsUpdated > 0 && `${c.authorsUpdated} authors`,
                  c.descriptionsUpdated > 0 && `${c.descriptionsUpdated} descriptions`,
                  c.genresUpdated > 0 && `${c.genresUpdated} genres`,
                  c.isbnsUpdated > 0 && `${c.isbnsUpdated} ISBNs`,
                  c.pageCountsUpdated > 0 && `${c.pageCountsUpdated} page counts`,
                  c.yearsUpdated > 0 && `${c.yearsUpdated} years`,
                  c.seriesUpdated > 0 && `${c.seriesUpdated} series`,
                ].filter(Boolean);
                return (
                  <Typography variant="body2" color="success.main" sx={{ mt: 0.5 }}>
                    Updated so far: {parts.join(', ')}{c.errorCount > 0 ? ` (${c.errorCount} errors)` : ''}
                  </Typography>
                );
              })()}
              {(isFilling ? fillProgress : refreshProgress).rateLimited && (
                <Typography variant="body2" color="warning.main" sx={{ mt: 0.5 }}>
                  Rate limited — slowing down
                </Typography>
              )}
              {(isFilling ? fillProgress : refreshProgress).providerSwitched && (
                <Typography variant="body2" color="info.main" sx={{ mt: 0.5 }}>
                  Switched to Open Library due to rate limiting
                </Typography>
              )}
            </Box>
          )}
        </Paper>
      )}

      {/* Refresh All Review Dialog */}
      <Dialog open={showRefreshReview} onClose={() => { setShowRefreshReview(false); setRefreshResults([]); setRefreshedBookIds(new Set()); }} fullWidth maxWidth="md">
        <DialogTitle>Review Proposed Changes</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Found changes for {refreshResults.length} books. Toggle individual changes on/off, then click Apply.
          </DialogContentText>

          {refreshResults.length === 0 ? (
            <Typography color="text.secondary">No changes found — all books are up to date.</Typography>
          ) : (
            <List>
              {refreshResults.map((diff, bookIndex) => (
                <ListItem key={diff.book.id} divider alignItems="flex-start" sx={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <BookCover title={diff.book.title} author={diff.book.author} width={36} height={50} />
                    <Box>
                      <Typography variant="subtitle2">{diff.book.title}</Typography>
                      {diff.book.author && (
                        <Typography variant="caption" color="text.secondary">by {diff.book.author}</Typography>
                      )}
                    </Box>
                  </Box>
                  {diff.changes.map((change, changeIndex) => (
                    <Box
                      key={change.field}
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1,
                        ml: 2,
                        mb: 0.5,
                        opacity: change.checked ? 1 : 0.5,
                        cursor: 'pointer',
                      }}
                      onClick={() => handleToggleRefreshChange(bookIndex, changeIndex)}
                    >
                      <Checkbox
                        size="small"
                        checked={change.checked}
                        sx={{ p: 0.25 }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="caption" color="text.secondary">
                          {{ author: 'Author', description: 'Description', genres: 'Genres', isbn: 'ISBN', pageCount: 'Pages', publicationYear: 'Year', seriesName: 'Series', seriesNumber: 'Series #' }[change.field] || change.field}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <Typography
                            variant="body2"
                            sx={{
                              textDecoration: 'line-through',
                              color: 'error.main',
                              maxWidth: '45%',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: change.field === 'description' ? 'normal' : 'nowrap',
                            }}
                          >
                            {change.oldValue}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">{'\u2192'}</Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              color: 'success.main',
                              maxWidth: '45%',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: change.field === 'description' ? 'normal' : 'nowrap',
                            }}
                          >
                            {change.newValue}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setShowRefreshReview(false); setRefreshResults([]); setRefreshedBookIds(new Set()); }}>Cancel</Button>
          <Button
            onClick={handleApplyRefreshUpdates}
            variant="contained"
            color="primary"
            disabled={refreshResults.every(d => d.changes.every(c => !c.checked))}
          >
            Apply Selected Changes ({refreshResults.reduce((sum, d) => sum + d.changes.filter(c => c.checked).length, 0)})
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default BookMetadataSettings;
