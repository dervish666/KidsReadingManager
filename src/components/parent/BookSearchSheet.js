import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Button,
  Dialog,
  DialogContent,
  TextField,
  InputAdornment,
} from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import BookCover from '../BookCover';
import BookCoverPlaceholder from '../BookCoverPlaceholder';
import BarcodeScanner from '../books/BarcodeScanner';
import { NUNITO, tappableCardSx } from './parentPortalStyles';

/**
 * "Find a Book" bottom sheet: debounced library + external search plus the
 * barcode scanner. Fully self-contained — the parent only learns about the
 * chosen book via onSelect(book).
 */
const BookSearchSheet = ({ open, apiBase, onSelect, onClose }) => {
  const theme = useTheme();
  const { accent } = theme.palette.parent;

  const [bookQuery, setBookQuery] = useState('');
  const [bookResults, setBookResults] = useState({ library: [], external: [] });
  const [searchLoading, setSearchLoading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  // Reset the query whenever the sheet opens fresh.
  useEffect(() => {
    if (open) {
      setBookQuery('');
      setBookResults({ library: [], external: [] });
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open || !bookQuery.trim()) {
      setBookResults({ library: [], external: [] });
      return undefined;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`${apiBase}/books?q=${encodeURIComponent(bookQuery.trim())}`);
        if (res.ok) {
          const json = await res.json();
          setBookResults({
            library: json.library || [],
            external: json.external || [],
          });
        }
      } catch {
        // Silently ignore search errors
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [bookQuery, open, apiBase]);

  const handleSelect = (book) => {
    setBookQuery('');
    onSelect(book);
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={() => {
          setBookQuery('');
          onClose();
        }}
        fullWidth
        maxWidth="sm"
        aria-label="Find a book"
        PaperProps={{
          sx: {
            position: 'fixed',
            bottom: 0,
            top: 60,
            left: 0,
            right: 0,
            m: 0,
            maxWidth: '100% !important',
            width: '100%',
            borderRadius: '16px 16px 0 0',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
        sx={{ '& .MuiDialog-container': { alignItems: 'flex-end' } }}
      >
        <DialogContent
          sx={{ pt: 2, pb: 2, px: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          <Typography
            variant="h6"
            sx={{ fontWeight: 700, color: 'parent.accent', mb: 1.5, fontFamily: NUNITO }}
          >
            Find a Book
          </Typography>

          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              autoFocus
              placeholder="Search by title or author"
              value={bookQuery}
              onChange={(e) => setBookQuery(e.target.value)}
              fullWidth
              size="small"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: 'parent.accent' }} fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Button
              variant="outlined"
              onClick={() => setScannerOpen(true)}
              aria-label="Scan a book barcode"
              sx={{
                minWidth: 44,
                px: 1,
                borderColor: 'parent.accentBorder',
                color: 'parent.accent',
                '&:hover': { borderColor: 'parent.accent', bgcolor: alpha(accent, 0.08) },
              }}
            >
              <QrCodeScannerIcon />
            </Button>
          </Box>

          {searchLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} sx={{ color: 'parent.accent' }} />
            </Box>
          )}

          <Box sx={{ overflow: 'auto', flex: 1 }}>
            {/* School Library results */}
            {bookResults.library.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    fontWeight: 700,
                    display: 'block',
                    mb: 0.75,
                    px: 0.5,
                  }}
                >
                  School Library
                </Typography>
                {bookResults.library.map((book) => (
                  <Paper
                    key={book.id}
                    component="button"
                    onClick={() => handleSelect(book)}
                    elevation={0}
                    sx={{
                      ...tappableCardSx,
                      p: 1.25,
                      mb: 0.75,
                      borderRadius: 2,
                      border: `1px solid ${alpha(accent, 0.12)}`,
                      bgcolor: 'white',
                      gap: 1.5,
                      '&:hover': { bgcolor: alpha(accent, 0.04) },
                    }}
                  >
                    <BookCover
                      title={book.title}
                      author={book.author}
                      isbn={book.isbn}
                      width={32}
                      height={48}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {book.title}
                      </Typography>
                      {book.author && (
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {book.author}
                        </Typography>
                      )}
                    </Box>
                  </Paper>
                ))}
              </Box>
            )}

            {/* External / other books results */}
            {bookResults.external.length > 0 && (
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    fontWeight: 700,
                    display: 'block',
                    mb: 0.75,
                    px: 0.5,
                  }}
                >
                  Other Books
                </Typography>
                {bookResults.external.map((book, i) => (
                  <Paper
                    key={book.id || i}
                    component="button"
                    onClick={() => handleSelect(book)}
                    elevation={0}
                    sx={{
                      ...tappableCardSx,
                      p: 1.25,
                      mb: 0.75,
                      borderRadius: 2,
                      border: `1px solid ${alpha(accent, 0.08)}`,
                      bgcolor: 'white',
                      gap: 1.5,
                      '&:hover': { bgcolor: alpha(accent, 0.04) },
                    }}
                  >
                    {book.coverUrl ? (
                      <Box
                        component="img"
                        src={book.coverUrl}
                        alt=""
                        loading="lazy"
                        sx={{
                          width: 32,
                          height: 48,
                          borderRadius: 1,
                          objectFit: 'cover',
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <Box sx={{ flexShrink: 0 }}>
                        <BookCoverPlaceholder title={book.title} width={32} height={48} />
                      </Box>
                    )}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {book.title}
                      </Typography>
                      {book.author && (
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {book.author}
                        </Typography>
                      )}
                    </Box>
                  </Paper>
                ))}
              </Box>
            )}

            {!searchLoading && !bookQuery.trim() && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ textAlign: 'center', py: 4, px: 2 }}
              >
                Search the school library by title or author, or scan the barcode on the back of
                the book.
              </Typography>
            )}

            {!searchLoading &&
              bookQuery.trim() &&
              bookResults.library.length === 0 &&
              bookResults.external.length === 0 && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ textAlign: 'center', py: 3 }}
                >
                  No books found for &quot;{bookQuery}&quot;
                </Typography>
              )}
          </Box>
        </DialogContent>
      </Dialog>

      {/* Barcode scanner — scanning fills the search box with the ISBN */}
      <BarcodeScanner
        open={scannerOpen}
        onScan={(isbn) => {
          setScannerOpen(false);
          setBookQuery(isbn);
        }}
        onClose={() => setScannerOpen(false)}
      />
    </>
  );
};

export default BookSearchSheet;
