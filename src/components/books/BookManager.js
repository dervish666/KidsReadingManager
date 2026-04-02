import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Chip,
  Alert,
  Snackbar,
  Pagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import SearchIcon from '@mui/icons-material/Search';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { parseCSV, isDuplicateBook } from './bookImportUtils';
import BookImportWizard from './BookImportWizard';
import BookExportMenu from './BookExportMenu';
import BookEditDialog from './BookEditDialog';
import ScanBookFlow from './ScanBookFlow';
import BookCover from '../BookCover';

const BookManager = () => {
  const { fetchWithAuth } = useAuth();
  const { books: contextBooks, genres, addBook, reloadDataFromServer, settings } = useData();
  const [fullBooks, setFullBooks] = useState(null);
  const books = fullBooks || contextBooks;

  // Fetch full book details when BookManager mounts.
  // DataContext loads books with ?fields=minimal (id, title, author only).
  // BookManager needs full details (readingLevel, genreIds, description, etc.)
  // for filtering, display, and export — so this separate fetch is required.
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

  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookAuthor, setNewBookAuthor] = useState('');
  const [newBookReadingLevel, setNewBookReadingLevel] = useState('');
  const [newBookAgeRange, setNewBookAgeRange] = useState('');
  const [editingBook, setEditingBook] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmImport, setConfirmImport] = useState({ open: false, file: null, data: null });
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const fileInputRef = useRef(null);

  // Pagination and filter state
  const [currentPage, setCurrentPage] = useState(1);
  const [booksPerPage, setBooksPerPage] = useState(10);
  const [genreFilter, setGenreFilter] = useState('');
  const [readingLevelFilter, setReadingLevelFilter] = useState('');
  const [levelRangeFilter, setLevelRangeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const handleAddBook = async (e) => {
    e.preventDefault();
    if (!newBookTitle.trim()) {
      setError('Please enter a book title.');
      return;
    }

    const bookData = {
      title: newBookTitle.trim(),
      author: newBookAuthor.trim() || null,
      readingLevel: newBookReadingLevel.trim() || null,
      ageRange: newBookAgeRange.trim() || null,
      genreIds: [], // Can be extended later
    };

    try {
      await addBook(bookData.title, bookData.author);
      await reloadDataFromServer();
      setNewBookTitle('');
      setNewBookAuthor('');
      setNewBookReadingLevel('');
      setNewBookAgeRange('');
      setError('');
    } catch (error) {
      setError('Failed to add book');
    }
  };

  const handleEditClick = (book) => {
    setEditingBook(book);
  };

  const handleDeleteClick = (book) => {
    setConfirmDelete(book);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;

    try {
      const response = await fetchWithAuth(`/api/books/${confirmDelete.id}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      await reloadDataFromServer();
      setConfirmDelete(null);
    } catch (error) {
      setError('Failed to delete book');
    }
  };

  const handleCancelDelete = () => setConfirmDelete(null);

  // Import functions
  const handleImportClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Reset the file input
    event.target.value = null;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let importedData;

        if (file.name.endsWith('.csv')) {
          importedData = parseCSV(e.target.result);
        } else if (file.name.endsWith('.json')) {
          importedData = JSON.parse(e.target.result);
        } else {
          throw new Error('Unsupported file format. Please use .json or .csv files.');
        }

        setConfirmImport({
          open: true,
          file,
          data: importedData
        });
      } catch (error) {
        setSnackbar({
          open: true,
          message: `Import failed: ${error.message}`,
          severity: 'error'
        });
      }
    };
    reader.readAsText(file);
  };

  const handleImportConfirm = async () => {
    const { data } = confirmImport;
    let importedBooks = [];

    try {
      if (Array.isArray(data)) {
        importedBooks = data;
      } else if (data.books && Array.isArray(data.books)) {
        importedBooks = data.books;
      } else {
        throw new Error('Invalid data format');
      }

      // Filter valid books
      const validBooks = importedBooks.filter(book => book.title && book.title.trim());

      if (validBooks.length === 0) {
        throw new Error('No valid books found in import data');
      }

      // Use bulk import endpoint for efficiency (avoids KV rate limits)
      const response = await fetchWithAuth('/api/books/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBooks),
      });

      if (!response.ok) {
        throw new Error(`Bulk import failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      await reloadDataFromServer();
      setConfirmImport({ open: false, file: null, data: null });

      // Create detailed message from bulk import result
      let message = `Import completed: ${result.imported} books imported`;
      if (result.duplicates > 0) {
        message += `, ${result.duplicates} duplicates skipped`;
      }

      setSnackbar({
        open: true,
        message,
        severity: 'success'
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Import failed: ${error.message}`,
        severity: 'error'
      });
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const handleCancelImport = () => {
    setConfirmImport({ open: false, file: null, data: null });
  };

  // Pagination helper functions
  const getTotalPages = () => {
    return Math.ceil(books.length / booksPerPage);
  };

  const getPaginatedBooks = () => {
    const startIndex = (currentPage - 1) * booksPerPage;
    const endIndex = startIndex + booksPerPage;
    return books.slice(startIndex, endIndex);
  };

  const handlePageChange = (event, newPage) => {
    setCurrentPage(newPage);
  };

  const handleBooksPerPageChange = (event) => {
    setBooksPerPage(event.target.value);
    setCurrentPage(1); // Reset to first page when changing items per page
  };

  // Get unique reading levels from books
  const readingLevels = useMemo(() => {
    const levels = new Set();
    books.forEach(book => {
      if (book.readingLevel) {
        levels.add(book.readingLevel);
      }
    });
    return Array.from(levels).sort();
  }, [books]);

  // Memoized filtered books to avoid recalculating on every render
  const filteredBooks = useMemo(() => {
    let filtered = books;

    // Search filter - search by title or author
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(book => {
        const title = (book.title || '').toLowerCase();
        const author = (book.author || '').toLowerCase();
        return title.includes(query) || author.includes(query);
      });
    }

    if (genreFilter) {
      filtered = filtered.filter(book => {
        const bookGenreIds = book.genreIds || [];
        return bookGenreIds.includes(genreFilter);
      });
    }

    // Reading level filter with optional range
    if (readingLevelFilter) {
      const baseLevel = parseFloat(readingLevelFilter);
      if (!isNaN(baseLevel)) {
        const range = levelRangeFilter ? parseFloat(levelRangeFilter) : 0;
        const maxLevel = baseLevel + range;

        filtered = filtered.filter(book => {
          const bookLevel = parseFloat(book.readingLevel);
          if (isNaN(bookLevel)) return false;
          return bookLevel >= baseLevel && bookLevel <= maxLevel;
        });
      } else {
        // Non-numeric level - exact match only
        filtered = filtered.filter(book => book.readingLevel === readingLevelFilter);
      }
    }

    return filtered;
  }, [books, searchQuery, genreFilter, readingLevelFilter, levelRangeFilter]);

  const handleGenreFilterChange = (event) => {
    setGenreFilter(event.target.value);
    setCurrentPage(1); // Reset to first page when changing filter
  };

  const handleReadingLevelFilterChange = (event) => {
    setReadingLevelFilter(event.target.value);
    setLevelRangeFilter(''); // Reset range when level changes
    setCurrentPage(1); // Reset to first page when changing filter
  };

  const handleLevelRangeFilterChange = (event) => {
    setLevelRangeFilter(event.target.value);
    setCurrentPage(1); // Reset to first page when changing filter
  };

  const handleSearchQueryChange = (event) => {
    setSearchQuery(event.target.value);
    setCurrentPage(1); // Reset to first page when searching
  };

  const getGenreName = (genreId) => {
    const genre = genres.find(g => g.id === genreId);
    return genre ? genre.name : 'Unknown';
  };

  // Memoized pagination values using filteredBooks
  const filteredTotalPages = useMemo(() => {
    return Math.ceil(filteredBooks.length / booksPerPage);
  }, [filteredBooks.length, booksPerPage]);

  const paginatedBooks = useMemo(() => {
    const startIndex = (currentPage - 1) * booksPerPage;
    const endIndex = startIndex + booksPerPage;
    return filteredBooks.slice(startIndex, endIndex);
  }, [filteredBooks, currentPage, booksPerPage]);

  return (
    <Paper sx={{ p: 3, mt: 3 }}>
      <Typography variant="h6" component="h1" gutterBottom>
        <LibraryBooksIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
        Manage Books
      </Typography>

      {/* Add Book Form and Actions */}
      <Box sx={{ mt: 2 }}>
        <Paper
          component="form"
          onSubmit={handleAddBook}
          variant="outlined"
          sx={{ p: 2 }}
        >
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Add Book Form Fields */}
            <Box sx={{ display: 'flex', gap: 1.5, flex: '1 1 auto', flexWrap: 'wrap', minWidth: 300 }}>
              <Typography variant="subtitle2" sx={{ width: '100%', mb: 0.5 }}>
                Add New Book
              </Typography>
              <TextField
                label="Book Title"
                value={newBookTitle}
                onChange={(e) => setNewBookTitle(e.target.value)}
                size="small"
                required
                sx={{ flex: '1 1 200px' }}
              />
              <TextField
                label="Author"
                value={newBookAuthor}
                onChange={(e) => setNewBookAuthor(e.target.value)}
                size="small"
                sx={{ flex: '1 1 150px' }}
              />
              <TextField
                label="Reading Level"
                value={newBookReadingLevel}
                onChange={(e) => setNewBookReadingLevel(e.target.value)}
                size="small"
                sx={{ flex: '0 1 100px' }}
              />
              <TextField
                label="Age Range"
                value={newBookAgeRange}
                onChange={(e) => setNewBookAgeRange(e.target.value)}
                size="small"
                placeholder="6-9"
                sx={{ flex: '0 1 80px' }}
              />
              <Button
                type="submit"
                variant="contained"
                color="primary"
                startIcon={<SaveIcon />}
                sx={{ flex: '0 0 auto' }}
              >
                Add
              </Button>
            </Box>

            {/* Action Buttons */}
            <Box sx={{ display: 'flex', gap: 1, flex: '0 0 auto', alignItems: 'center', alignSelf: 'flex-end' }}>
              {/* Scan ISBN Button */}
              <Button
                variant="outlined"
                startIcon={<QrCodeScannerIcon />}
                onClick={() => setScannerOpen(true)}
                size="small"
              >
                Scan ISBN
              </Button>

              {/* Import/Export Button with Menu */}
              <BookExportMenu
                books={books}
                genres={genres}
                onImportClick={() => setShowImportWizard(true)}
                onSnackbar={setSnackbar}
              />
            </Box>
          </Box>

          <input
            type="file"
            accept=".json,.csv"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </Paper>
      </Box>

      {error && (
        <Grid item xs={12}>
          <Alert severity="error">{error}</Alert>
        </Grid>
      )}

      <Box sx={{ mt: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="subtitle1">
              Existing Books ({(genreFilter || readingLevelFilter || searchQuery) ? `${filteredBooks.length} of ${books.length}` : books.length})
            </Typography>

            {/* Search Box */}
            <TextField
              size="small"
              placeholder="Search books..."
              aria-label="Search books"
              value={searchQuery}
              onChange={handleSearchQueryChange}
              sx={{ minWidth: 200 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />

            {/* Genre Filter */}
            {genres.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Filter by Genre</InputLabel>
                <Select
                  value={genreFilter}
                  label="Filter by Genre"
                  onChange={handleGenreFilterChange}
                >
                  <MenuItem value="">All Genres</MenuItem>
                  {genres.map((genre) => (
                    <MenuItem key={genre.id} value={genre.id}>{genre.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {/* Reading Level Filter */}
            {readingLevels.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Filter by Level</InputLabel>
                <Select
                  value={readingLevelFilter}
                  label="Filter by Level"
                  onChange={handleReadingLevelFilterChange}
                >
                  <MenuItem value="">All Levels</MenuItem>
                  {readingLevels.map((level) => (
                    <MenuItem key={level} value={level}>{level}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {/* Level Range Filter - only show when a level is selected */}
            {readingLevelFilter && (
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Level Range</InputLabel>
                <Select
                  value={levelRangeFilter}
                  label="Level Range"
                  onChange={handleLevelRangeFilterChange}
                >
                  <MenuItem value="">Exact</MenuItem>
                  <MenuItem value="0.5">+0.5</MenuItem>
                  <MenuItem value="1">+1.0</MenuItem>
                  <MenuItem value="1.5">+1.5</MenuItem>
                  <MenuItem value="2">+2.0</MenuItem>
                  <MenuItem value="2.5">+2.5</MenuItem>
                  <MenuItem value="3">+3.0</MenuItem>
                  <MenuItem value="4">+4.0</MenuItem>
                  <MenuItem value="5">+5.0</MenuItem>
                </Select>
              </FormControl>
            )}
          </Box>

          {books.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Books per page</InputLabel>
                <Select
                  value={booksPerPage}
                  label="Books per page"
                  onChange={handleBooksPerPageChange}
                >
                  <MenuItem value={5}>5</MenuItem>
                  <MenuItem value={10}>10</MenuItem>
                  <MenuItem value={20}>20</MenuItem>
                  <MenuItem value={50}>50</MenuItem>
                </Select>
              </FormControl>

              <Typography variant="body2" color="text.secondary">
                Showing {Math.min((currentPage - 1) * booksPerPage + 1, filteredBooks.length)}-{Math.min(currentPage * booksPerPage, filteredBooks.length)} of {filteredBooks.length}
              </Typography>
            </Box>
          )}
        </Box>

        {books.length === 0 ? (
          <Typography variant="body2">No books created yet.</Typography>
        ) : filteredBooks.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No books match the selected filters.</Typography>
        ) : (
          <>
            <List>
              {paginatedBooks.map((book) => (
                <ListItem
                  key={book.id}
                  divider
                  onClick={() => handleEditClick(book)}
                  sx={{
                    cursor: 'pointer',
                    '&:hover': {
                      backgroundColor: 'action.hover'
                    }
                  }}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(book);
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <Box sx={{ mr: 1.5, flexShrink: 0 }}>
                    <BookCover title={book.title} author={book.author} width={40} height={56} />
                  </Box>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', pr: 2 }}>
                        <Typography variant="subtitle2" sx={{ flexShrink: 0 }}>{book.title}</Typography>
                        {book.author && (
                          <Chip
                            label={`by ${book.author}`}
                            size="small"
                            variant="outlined"
                            sx={{ flexShrink: 0 }}
                          />
                        )}
                        {/* Reading Level chip */}
                        {book.readingLevel && (
                          <Chip
                            label={book.readingLevel}
                            size="small"
                            color="primary"
                            variant="filled"
                            sx={{ flexShrink: 0, fontSize: '0.7rem', height: 20 }}
                          />
                        )}
                        {/* Genre chips */}
                        {book.genreIds && book.genreIds.length > 0 && (
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {book.genreIds.slice(0, 3).map((genreId) => (
                              <Chip
                                key={genreId}
                                label={getGenreName(genreId)}
                                size="small"
                                color="warning"
                                variant="outlined"
                                sx={{ fontSize: '0.7rem', height: 20 }}
                              />
                            ))}
                            {book.genreIds.length > 3 && (
                              <Chip
                                label={`+${book.genreIds.length - 3}`}
                                size="small"
                                color="warning"
                                variant="outlined"
                                sx={{ fontSize: '0.7rem', height: 20 }}
                              />
                            )}
                          </Box>
                        )}
                        {book.description && (
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              flex: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              minWidth: 0
                            }}
                          >
                            {book.description}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>

            {filteredTotalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Pagination
                  count={filteredTotalPages}
                  page={currentPage}
                  onChange={handlePageChange}
                  color="primary"
                  showFirstButton
                  showLastButton
                />
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Edit Book Dialog */}
      <BookEditDialog
        book={editingBook}
        onClose={() => setEditingBook(null)}
        onSave={(message) => setSnackbar({ open: true, message, severity: 'success' })}
        genres={genres}
        settings={settings}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!confirmDelete} onClose={handleCancelDelete}>
        <DialogTitle>Delete Book</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete "{confirmDelete?.title}"? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>Cancel</Button>
          <Button onClick={handleConfirmDelete} color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import Confirmation */}
      <Dialog open={confirmImport.open} onClose={handleCancelImport} fullWidth maxWidth="sm">
        <DialogTitle>Confirm Import</DialogTitle>
        <DialogContent>
          {(() => {
            if (!confirmImport.data) return null;

            let importedBooks = [];
            if (Array.isArray(confirmImport.data)) {
              importedBooks = confirmImport.data;
            } else if (confirmImport.data.books && Array.isArray(confirmImport.data.books)) {
              importedBooks = confirmImport.data.books;
            }

            const validBooks = importedBooks.filter(book => book.title && book.title.trim());
            const duplicates = validBooks.filter(book => isDuplicateBook(book, books));
            const newBooks = validBooks.length - duplicates.length;

            return (
              <>
                <DialogContentText sx={{ mb: 2 }}>
                  Import {validBooks.length} books from "{confirmImport.file?.name}"?
                </DialogContentText>

                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="success.main">
                    • {newBooks} new books will be imported
                  </Typography>
                  {duplicates.length > 0 && (
                    <Typography variant="body2" color="warning.main">
                      • {duplicates.length} duplicates will be skipped
                    </Typography>
                  )}
                </Box>

                {duplicates.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Duplicates to be skipped:
                    </Typography>
                    <Box sx={{ maxHeight: 200, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
                      {duplicates.slice(0, 10).map((book, index) => (
                        <Typography key={index} variant="body2" color="text.secondary">
                          • {book.title}{book.author ? ` by ${book.author}` : ''}
                        </Typography>
                      ))}
                      {duplicates.length > 10 && (
                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                          ... and {duplicates.length - 10} more
                        </Typography>
                      )}
                    </Box>
                  </Box>
                )}
              </>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelImport}>Cancel</Button>
          <Button onClick={handleImportConfirm} color="primary" variant="contained">
            Import
          </Button>
        </DialogActions>
      </Dialog>

      {/* Book Import Wizard */}
      <BookImportWizard
        open={showImportWizard}
        onClose={() => setShowImportWizard(false)}
      />

      {/* ISBN Scanner Flow */}
      <ScanBookFlow
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onBookSelected={(book) => {
          setScannerOpen(false);
          reloadDataFromServer();
          setSnackbar({ open: true, message: `Added "${book.title}" to library`, severity: 'success' });
        }}
      />

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
    </Paper>
  );
};

export default BookManager;
