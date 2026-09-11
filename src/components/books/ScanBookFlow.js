import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  CircularProgress,
  Alert,
  Divider,
} from '@mui/material';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import BarcodeScanner from './BarcodeScanner';
import BookCover from '../BookCover';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';

/**
 * ScanBookFlow — orchestrates the full scan-to-add flow:
 * scan barcode → look up ISBN → show preview → confirm/select.
 *
 * Props:
 * - open (boolean): Whether the dialog is open
 * - onClose (() => void): Called when the dialog should close
 * - onBookSelected ((book) => void): Called when a book is confirmed/selected
 *
 * A book that isn't in the school library gets two choices: "Add to Library"
 * (the school holds it) or "Pupil's Own Book" (a copy brought from home,
 * loggable but never recommended, `fromHome: true`). A known home copy can be
 * selected as-is or promoted to the library when the school buys one.
 */

// Step states for the flow
const STEPS = {
  SCANNING: 'scanning',
  LOADING: 'loading',
  PREVIEW: 'preview',
  ERROR: 'error',
};

const ScanBookFlow = ({ open, onClose, onBookSelected }) => {
  const { fetchWithAuth } = useAuth();
  const { upsertBookLocal } = useData();

  const [step, setStep] = useState(STEPS.SCANNING);
  const [isbn, setIsbn] = useState(null);
  const [lookupResult, setLookupResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const resetState = useCallback(() => {
    setStep(STEPS.SCANNING);
    setIsbn(null);
    setLookupResult(null);
    setErrorMessage('');
    setIsAdding(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    if (onClose) {
      onClose();
    }
  }, [resetState, onClose]);

  const handleScan = useCallback(
    async (scannedIsbn) => {
      setIsbn(scannedIsbn);
      setStep(STEPS.LOADING);
      setErrorMessage('');

      try {
        const response = await fetchWithAuth(`/api/books/isbn/${encodeURIComponent(scannedIsbn)}`);
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.message || `Lookup failed (${response.status})`);
        }
        const result = await response.json();
        setLookupResult(result);
        setStep(STEPS.PREVIEW);
      } catch (err) {
        setErrorMessage(err.message || 'Failed to look up ISBN');
        setStep(STEPS.ERROR);
      }
    },
    [fetchWithAuth]
  );

  const handleScanAgain = useCallback(() => {
    resetState();
  }, [resetState]);

  const finishWithBook = useCallback(
    (book) => {
      // Patch the returned book into the shared books list locally instead of
      // reloading the whole dataset.
      if (book) {
        upsertBookLocal(book);
      }
      if (onBookSelected) {
        onBookSelected(book);
      }
      resetState();
    },
    [upsertBookLocal, onBookSelected, resetState]
  );

  const handleAddBook = useCallback(
    async (fromHome) => {
      if (!isbn) return;
      setIsAdding(true);

      try {
        const response = await fetchWithAuth('/api/books/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isbn, confirm: true, fromHome }),
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.message || `Failed to add book (${response.status})`);
        }
        const result = await response.json();
        finishWithBook(result.book);
      } catch (err) {
        setErrorMessage(err.message || 'Failed to add book');
        setStep(STEPS.ERROR);
        setIsAdding(false);
      }
    },
    [isbn, fetchWithAuth, finishWithBook]
  );

  const handleAddToLibrary = useCallback(() => handleAddBook(false), [handleAddBook]);
  const handleAddAsHomeBook = useCallback(() => handleAddBook(true), [handleAddBook]);

  // A pupil's own copy the school has now bought: flip the per-org link.
  const handlePromoteToLibrary = useCallback(async () => {
    const bookId = lookupResult?.book?.id;
    if (!bookId) return;
    setIsAdding(true);
    try {
      const response = await fetchWithAuth(`/api/books/${encodeURIComponent(bookId)}/ownership`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromHome: false }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Failed to add book (${response.status})`);
      }
      finishWithBook(await response.json());
    } catch (err) {
      setErrorMessage(err.message || 'Failed to add book to library');
      setStep(STEPS.ERROR);
      setIsAdding(false);
    }
  }, [lookupResult, fetchWithAuth, finishWithBook]);

  const handleSelectBook = useCallback(() => {
    if (lookupResult && lookupResult.book && onBookSelected) {
      onBookSelected(lookupResult.book);
    }
    resetState();
  }, [lookupResult, onBookSelected, resetState]);

  // Render the scanner step
  if (step === STEPS.SCANNING) {
    return <BarcodeScanner open={open} onScan={handleScan} onClose={handleClose} />;
  }

  // All other steps render inside a Dialog
  const book = lookupResult?.book;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {step === STEPS.LOADING && 'Looking Up Book...'}
        {step === STEPS.PREVIEW && 'Book Found'}
        {step === STEPS.ERROR && 'Lookup Failed'}
      </DialogTitle>
      <DialogContent>
        {/* Loading state */}
        {step === STEPS.LOADING && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
            <CircularProgress size={48} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Looking up ISBN {isbn}...
            </Typography>
          </Box>
        )}

        {/* Error state */}
        {step === STEPS.ERROR && (
          <Box sx={{ py: 2 }}>
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMessage}
            </Alert>
            {isbn && (
              <Typography variant="caption" color="text.secondary">
                ISBN: {isbn}
              </Typography>
            )}
          </Box>
        )}

        {/* Preview state */}
        {step === STEPS.PREVIEW && lookupResult && (
          <Box sx={{ py: 1 }}>
            {/* Source-based alert messages */}
            {lookupResult.source === 'local' && lookupResult.inLibrary && (
              <Alert severity="info" sx={{ mb: 2 }}>
                This book is already in your library
              </Alert>
            )}
            {lookupResult.source === 'local' && lookupResult.fromHome && (
              <Alert severity="info" icon={<HomeOutlinedIcon />} sx={{ mb: 2 }}>
                One of your pupils&apos; own books. Select it to log a session, or add it to the
                library if the school now has a copy.
              </Alert>
            )}
            {lookupResult.source === 'local' &&
              !lookupResult.inLibrary &&
              !lookupResult.fromHome && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  This book exists but isn't in your school's library yet
                </Alert>
              )}
            {lookupResult.source === 'not_found' && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Book not found. ISBN: {lookupResult.isbn || isbn}
              </Alert>
            )}

            {/* Book preview card */}
            {book && book.title && (
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Box sx={{ flexShrink: 0 }}>
                  <BookCover
                    title={book.title}
                    author={book.author}
                    isbn={book.isbn || null}
                    width={80}
                    height={120}
                  />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="h6" noWrap>
                    {book.title}
                  </Typography>
                  {book.author && (
                    <Typography variant="body2" color="text.secondary">
                      {book.author}
                    </Typography>
                  )}
                  <Divider sx={{ my: 1 }} />
                  {book.isbn && (
                    <Typography variant="caption" display="block" color="text.secondary">
                      ISBN: {book.isbn}
                    </Typography>
                  )}
                  {book.pageCount && (
                    <Typography variant="caption" display="block" color="text.secondary">
                      Pages: {book.pageCount}
                    </Typography>
                  )}
                  {book.publicationYear && (
                    <Typography variant="caption" display="block" color="text.secondary">
                      Published: {book.publicationYear}
                    </Typography>
                  )}
                  {book.seriesName && (
                    <Typography variant="caption" display="block" color="text.secondary">
                      Series: {book.seriesName}
                      {book.seriesNumber ? ` (#${book.seriesNumber})` : ''}
                    </Typography>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>

        {/* Error step actions */}
        {step === STEPS.ERROR && (
          <Button onClick={handleScanAgain} variant="outlined">
            Scan Again
          </Button>
        )}

        {/* Preview step actions */}
        {step === STEPS.PREVIEW && lookupResult && (
          <>
            <Button onClick={handleScanAgain} variant="outlined">
              Scan Again
            </Button>

            {/* "Select This Book" — local book already in library */}
            {lookupResult.source === 'local' && lookupResult.inLibrary && (
              <Button onClick={handleSelectBook} variant="contained">
                Select This Book
              </Button>
            )}

            {/* Known pupil's own copy: use as-is, or promote now the school has one */}
            {lookupResult.source === 'local' && lookupResult.fromHome && (
              <>
                <Button
                  onClick={handlePromoteToLibrary}
                  variant="outlined"
                  disabled={isAdding}
                  startIcon={isAdding ? <CircularProgress size={16} /> : null}
                >
                  {isAdding ? 'Adding...' : 'Add to Library'}
                </Button>
                <Button onClick={handleSelectBook} variant="contained" disabled={isAdding}>
                  Select This Book
                </Button>
              </>
            )}

            {/* Not in this school at all (local unlinked or OpenLibrary): two ways in */}
            {((lookupResult.source === 'local' &&
              !lookupResult.inLibrary &&
              !lookupResult.fromHome) ||
              lookupResult.source === 'openlibrary') && (
              <>
                <Button
                  onClick={handleAddAsHomeBook}
                  variant="outlined"
                  disabled={isAdding}
                  startIcon={<HomeOutlinedIcon />}
                >
                  Pupil&apos;s Own Book
                </Button>
                <Button
                  onClick={handleAddToLibrary}
                  variant="contained"
                  disabled={isAdding}
                  startIcon={isAdding ? <CircularProgress size={16} /> : null}
                >
                  {isAdding ? 'Adding...' : 'Add to Library'}
                </Button>
              </>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ScanBookFlow;
