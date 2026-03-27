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
  CircularProgress,
  Pagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  InputAdornment,
  Menu,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import InfoIcon from '@mui/icons-material/Info';
import SearchIcon from '@mui/icons-material/Search';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import {
  getBookDetails,
  findGenresForBook,
  checkAvailability,
  getProviderDisplayName,
  validateProviderConfig
} from '../../utils/bookMetadataApi';
import BookImportWizard from './BookImportWizard';
import ScanBookFlow from './ScanBookFlow';
import BookCover from '../BookCover';

const BookManager = () => {
  const { fetchWithAuth } = useAuth();
  const { books: contextBooks, genres, addBook, reloadDataFromServer, settings } = useData();
  const [fullBooks, setFullBooks] = useState(null);
  const books = fullBooks || contextBooks;

  // Fetch full book details when BookManager mounts (context only has minimal data)
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
  const [editBookTitle, setEditBookTitle] = useState('');
  const [editBookAuthor, setEditBookAuthor] = useState('');
  const [editBookReadingLevel, setEditBookReadingLevel] = useState('');
  const [editBookAgeRange, setEditBookAgeRange] = useState('');
  const [editBookDescription, setEditBookDescription] = useState('');
  const [editBookGenreIds, setEditBookGenreIds] = useState([]);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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
  const [importExportMenuAnchor, setImportExportMenuAnchor] = useState(null);
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
    setEditBookTitle(book.title || '');
    setEditBookAuthor(book.author || '');
    setEditBookReadingLevel(book.readingLevel || '');
    setEditBookAgeRange(book.ageRange || '');
    setEditBookDescription(book.description || '');

    setEditBookGenreIds(book.genreIds || []);
    setError('');
  };

  const handleFetchBookDetails = async () => {
    if (!editBookTitle.trim()) {
      setSnackbar({
        open: true,
        message: 'Please enter a book title first',
        severity: 'warning'
      });
      return;
    }

    // Validate provider configuration
    const configValidation = validateProviderConfig(settings);
    if (!configValidation.valid) {
      setSnackbar({
        open: true,
        message: configValidation.error,
        severity: 'error'
      });
      return;
    }

    setIsFetchingDetails(true);
    const providerName = getProviderDisplayName(settings);
    
    // Check provider availability first with a quick timeout
    const isAvailable = await checkAvailability(settings, 3000);
    if (!isAvailable) {
      setIsFetchingDetails(false);
      setSnackbar({
        open: true,
        message: `${providerName} is currently unavailable. Please try again later.`,
        severity: 'error'
      });
      return;
    }
    
    try {
      // Fetch book details (cover and description)
      const details = await getBookDetails(editBookTitle, editBookAuthor || null, settings);

      let foundCover = false;
      let foundDescription = false;
      let foundGenres = false;

      if (details) {
        if (details.coverUrl) {

          foundCover = true;
        }
        if (details.description) {
          setEditBookDescription(details.description);
          foundDescription = true;
        }
      }

      // Also fetch genres
      try {
        const genresResult = await findGenresForBook(editBookTitle, editBookAuthor || null, settings);
        if (genresResult && genresResult.length > 0) {
          // Create a map of genre name to ID
          const genreNameToId = {};
          for (const genre of genres) {
            genreNameToId[genre.name.toLowerCase()] = genre.id;
          }

          // Map found genres to existing genre IDs (case-insensitive)
          const matchedGenreIds = genresResult
            .map(genreName => genreNameToId[genreName.toLowerCase()])
            .filter(id => id);

          if (matchedGenreIds.length > 0) {
            // Merge with existing genres (avoid duplicates)
            const updatedGenreIds = [...new Set([...editBookGenreIds, ...matchedGenreIds])];
            setEditBookGenreIds(updatedGenreIds);
            foundGenres = true;
          }
        }
      } catch (genreError) {
        // Don't fail the whole operation if genres fail
      }

      // Build success message
      if (foundCover || foundDescription || foundGenres) {
        const parts = [];
        if (foundCover) parts.push('cover');
        if (foundDescription) parts.push('description');
        if (foundGenres) parts.push('genres');

        setSnackbar({
          open: true,
          message: `Loaded ${parts.join(', ')} from ${providerName}`,
          severity: 'success'
        });
      } else {
        setSnackbar({
          open: true,
          message: `No details found for this book on ${providerName}`,
          severity: 'warning'
        });
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Failed to fetch details: ${error.message}`,
        severity: 'error'
      });
    } finally {
      setIsFetchingDetails(false);
    }
  };

  const handleUpdateBook = async (e) => {
    e.preventDefault();
    if (!editingBook) return;
    if (!editBookTitle.trim()) {
      setError('Please enter a book title.');
      return;
    }

    setIsSaving(true);
    try {
      // Use authenticated helper for consistency with protected API
      const response = await fetchWithAuth(`/api/books/${editingBook.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editBookTitle.trim(),
          author: editBookAuthor.trim() || null,
          readingLevel: editBookReadingLevel.trim() || null,
          ageRange: editBookAgeRange.trim() || null,
          description: editBookDescription.trim() || null,
          genreIds: editBookGenreIds,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      await reloadDataFromServer();
      setEditingBook(null);
      setEditBookTitle('');
      setEditBookAuthor('');
      setEditBookReadingLevel('');
      setEditBookAgeRange('');
      setEditBookDescription('');

      setEditBookGenreIds([]);
      setError('');
    } catch (error) {
      setError('Failed to update book');
    } finally {
      setIsSaving(false);
    }
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

  // Export functions
  const handleExportJSON = () => {
    try {
      const dataStr = JSON.stringify(books, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

      const exportFileDefaultName = `books_export_${new Date().toISOString().split('T')[0]}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

      setSnackbar({
        open: true,
        message: 'Books exported successfully',
        severity: 'success'
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: 'Export failed',
        severity: 'error'
      });
    }
  };

  const handleExportCSV = () => {
    try {
      const headers = ['Title', 'Author', 'Reading Level', 'Age Range'];
      const csvContent = [
        headers.join(','),
        ...books.map(book => [
          `"${(book.title || '').replace(/"/g, '""')}"`,
          `"${(book.author || '').replace(/"/g, '""')}"`,
          `"${(book.readingLevel || '').replace(/"/g, '""')}"`,
          `"${(book.ageRange || '').replace(/"/g, '""')}"`
        ].join(','))
      ].join('\n');

      const dataUri = 'data:text/csv;charset=utf-8,'+ encodeURIComponent(csvContent);
      const exportFileDefaultName = `books_export_${new Date().toISOString().split('T')[0]}.csv`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

      setSnackbar({
        open: true,
        message: 'Books exported successfully',
        severity: 'success'
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: 'Export failed',
        severity: 'error'
      });
    }
  };

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

  const parseCSV = (csvText) => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) throw new Error('CSV file must have at least a header row and one data row');

    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const expectedHeaders = ['Title', 'Author', 'Reading Level', 'Age Range'];

    // Check if headers match expected format
    const headerMatches = expectedHeaders.every(expected =>
      headers.some(header => header.toLowerCase() === expected.toLowerCase())
    );

    if (!headerMatches) {
      throw new Error('CSV headers must include: Title, Author, Reading Level, Age Range');
    }

    const books = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length >= 4) {
        books.push({
          title: values[0]?.trim() || '',
          author: values[1]?.trim() || null,
          readingLevel: values[2]?.trim() || null,
          ageRange: values[3]?.trim() || null
        });
      }
    }

    if (books.length === 0) throw new Error('No valid books found in CSV file');

    return books;
  };

  const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
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

  const handleCancelEdit = () => {
    setEditingBook(null);
    setEditBookTitle('');
    setEditBookAuthor('');
    setEditBookReadingLevel('');
    setEditBookAgeRange('');
    setEditBookDescription('');
    setEditBookGenreIds([]);
    setError('');
  };

  // Duplicate detection helper function
  const isDuplicateBook = (newBook, existingBooks) => {
    const normalizeTitle = (title) => {
      return title.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
    };

    const normalizeAuthor = (author) => {
      if (!author) return '';
      return author.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
    };

    const newTitle = normalizeTitle(newBook.title || '');
    const newAuthor = normalizeAuthor(newBook.author || '');

    return existingBooks.some(existingBook => {
      const existingTitle = normalizeTitle(existingBook.title || '');
      const existingAuthor = normalizeAuthor(existingBook.author || '');

      // Check for exact title match
      if (newTitle === existingTitle) {
        // If both have authors, they must match
        if (newAuthor && existingAuthor) {
          return newAuthor === existingAuthor;
        }
        // If one has no author, consider it a duplicate (same title)
        return true;
      }
      return false;
    });
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
  const getUniqueReadingLevels = () => {
    const levels = new Set();
    books.forEach(book => {
      if (book.readingLevel) {
        levels.add(book.readingLevel);
      }
    });
    return Array.from(levels).sort();
  };

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
              <Button
                variant="outlined"
                startIcon={<ImportExportIcon />}
                onClick={(e) => setImportExportMenuAnchor(e.currentTarget)}
                size="small"
              >
                Import/Export
              </Button>
              <Menu
                anchorEl={importExportMenuAnchor}
                open={Boolean(importExportMenuAnchor)}
                onClose={() => setImportExportMenuAnchor(null)}
              >
                <MenuItem
                  onClick={() => {
                    setImportExportMenuAnchor(null);
                    setShowImportWizard(true);
                  }}
                >
                  <UploadIcon fontSize="small" sx={{ mr: 1 }} />
                  Import Books
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setImportExportMenuAnchor(null);
                    handleExportJSON();
                  }}
                  disabled={books.length === 0}
                >
                  <DownloadIcon fontSize="small" sx={{ mr: 1 }} />
                  Export JSON
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setImportExportMenuAnchor(null);
                    handleExportCSV();
                  }}
                  disabled={books.length === 0}
                >
                  <DownloadIcon fontSize="small" sx={{ mr: 1 }} />
                  Export CSV
                </MenuItem>
              </Menu>
            </Box>
          </Box>

          {error && (
            <Typography color="error" variant="body2" sx={{ mt: 1 }}>
              {error}
            </Typography>
          )}

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
            {getUniqueReadingLevels().length > 0 && (
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Filter by Level</InputLabel>
                <Select
                  value={readingLevelFilter}
                  label="Filter by Level"
                  onChange={handleReadingLevelFilterChange}
                >
                  <MenuItem value="">All Levels</MenuItem>
                  {getUniqueReadingLevels().map((level) => (
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
      <Dialog open={!!editingBook} onClose={handleCancelEdit} fullWidth maxWidth="md">
        <DialogTitle>Edit Book</DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={handleUpdateBook} sx={{ mt: 1 }}>
            {/* Cover, Description, and Genres Row */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
              {/* Cover Image */}
              <Box
                sx={{
                  flexShrink: 0,
                  width: 140,
                  display: 'flex',
                  alignItems: 'flex-start'
                }}
              >
                <BookCover title={editBookTitle} author={editBookAuthor} width={140} height={190} />
              </Box>
              
              {/* Description beside cover */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <TextField
                  label="Description"
                  value={editBookDescription}
                  onChange={(e) => setEditBookDescription(e.target.value)}
                  fullWidth
                  size="small"
                  multiline
                  rows={4}
                  placeholder="Book description (can be fetched from OpenLibrary)"
                />
              </Box>
              
              {/* Genre Tags Section */}
              <Box
                sx={{
                  flexShrink: 0,
                  width: 200,
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                  Genres
                </Typography>
                <Box
                  sx={{
                    flex: 1,
                    border: '1px solid',
                    borderColor: 'grey.300',
                    borderRadius: 1,
                    p: 1,
                    minHeight: 100,
                    maxHeight: 120,
                    overflowY: 'auto',
                    backgroundColor: 'grey.50'
                  }}
                >
                  {/* Display selected genre chips */}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                    {editBookGenreIds.map(genreId => {
                      const genre = genres.find(g => g.id === genreId);
                      return genre ? (
                        <Chip
                          key={genreId}
                          label={genre.name}
                          size="small"
                          onDelete={() => setEditBookGenreIds(prev => prev.filter(id => id !== genreId))}
                          sx={{ height: 24 }}
                        />
                      ) : null;
                    })}
                    {editBookGenreIds.length === 0 && (
                      <Typography variant="caption" color="text.secondary">
                        No genres selected
                      </Typography>
                    )}
                  </Box>
                </Box>
                {/* Genre selector dropdown */}
                <FormControl size="small" sx={{ mt: 1 }}>
                  <InputLabel id="edit-genre-select-label">Add Genre</InputLabel>
                  <Select
                    labelId="edit-genre-select-label"
                    value=""
                    label="Add Genre"
                    onChange={(e) => {
                      const genreId = e.target.value;
                      if (genreId && !editBookGenreIds.includes(genreId)) {
                        setEditBookGenreIds(prev => [...prev, genreId]);
                      }
                    }}
                  >
                    {genres
                      .filter(genre => !editBookGenreIds.includes(genre.id))
                      .map(genre => (
                        <MenuItem key={genre.id} value={genre.id}>
                          {genre.name}
                        </MenuItem>
                      ))
                    }
                  </Select>
                </FormControl>
              </Box>
            </Box>
            
            {/* Form Fields */}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Book Title"
                  value={editBookTitle}
                  onChange={(e) => setEditBookTitle(e.target.value)}
                  fullWidth
                  size="small"
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Author"
                  value={editBookAuthor}
                  onChange={(e) => setEditBookAuthor(e.target.value)}
                  fullWidth
                  size="small"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Reading Level"
                  value={editBookReadingLevel}
                  onChange={(e) => setEditBookReadingLevel(e.target.value)}
                  fullWidth
                  size="small"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Age Range"
                  value={editBookAgeRange}
                  onChange={(e) => setEditBookAgeRange(e.target.value)}
                  fullWidth
                  size="small"
                  placeholder="e.g., 6-9"
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="outlined"
            startIcon={isFetchingDetails ? <CircularProgress size={20} /> : <InfoIcon />}
            onClick={handleFetchBookDetails}
            disabled={isFetchingDetails || !editBookTitle.trim()}
            size="small"
          >
            {isFetchingDetails ? 'Loading...' : 'Get Details'}
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={handleCancelEdit}>Cancel</Button>
          <Button onClick={handleUpdateBook} variant="contained" color="primary" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

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