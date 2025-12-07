import React, { useState, useRef } from 'react';
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
  LinearProgress,
  CircularProgress,
  Pagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import InfoIcon from '@mui/icons-material/Info';
import DescriptionIcon from '@mui/icons-material/Description';
import { useAppContext } from '../../contexts/AppContext';
import { batchFindMissingAuthors, batchFindMissingDescriptions, getBookDetails, checkOpenLibraryAvailability } from '../../utils/openLibraryApi';

const BookManager = () => {
  const { books, genres, addBook, reloadDataFromServer, fetchWithAuth } = useAppContext();
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
  const [editBookCoverUrl, setEditBookCoverUrl] = useState(null);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmImport, setConfirmImport] = useState({ open: false, file: null, data: null });
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const fileInputRef = useRef(null);
  
  // Author lookup state
  const [isLookingUpAuthors, setIsLookingUpAuthors] = useState(false);
  const [authorLookupProgress, setAuthorLookupProgress] = useState({ current: 0, total: 0, book: '' });
  const [authorLookupResults, setAuthorLookupResults] = useState([]);
  const [showAuthorResults, setShowAuthorResults] = useState(false);
  const [includeUnknownAuthors, setIncludeUnknownAuthors] = useState(true);
  
  // Description lookup state
  const [isLookingUpDescriptions, setIsLookingUpDescriptions] = useState(false);
  const [descriptionLookupProgress, setDescriptionLookupProgress] = useState({ current: 0, total: 0, book: '' });
  const [descriptionLookupResults, setDescriptionLookupResults] = useState([]);
  const [showDescriptionResults, setShowDescriptionResults] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [booksPerPage, setBooksPerPage] = useState(10);

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
      console.error('Error adding book:', error);
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
    setEditBookCoverUrl(null); // Cover is not stored, only fetched on demand
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

    setIsFetchingDetails(true);
    
    // Check OpenLibrary availability first with a quick timeout
    const isAvailable = await checkOpenLibraryAvailability(3000);
    if (!isAvailable) {
      setIsFetchingDetails(false);
      setSnackbar({
        open: true,
        message: 'OpenLibrary is currently unavailable. Please try again later.',
        severity: 'error'
      });
      return;
    }
    
    try {
      const details = await getBookDetails(editBookTitle, editBookAuthor || null);
      
      if (details) {
        if (details.coverUrl) {
          setEditBookCoverUrl(details.coverUrl);
        }
        if (details.description) {
          setEditBookDescription(details.description);
        }
        setSnackbar({
          open: true,
          message: details.description ? 'Book details loaded successfully' : 'Cover found, but no description available',
          severity: 'success'
        });
      } else {
        setSnackbar({
          open: true,
          message: 'No details found for this book',
          severity: 'warning'
        });
      }
    } catch (error) {
      console.error('Error fetching book details:', error);
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
          genreIds: editingBook.genreIds || [],
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
      setEditBookCoverUrl(null);
      setError('');
    } catch (error) {
      console.error('Error updating book:', error);
      setError('Failed to update book');
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
      console.error('Error deleting book:', error);
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
      console.error('Export failed:', error);
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
      console.error('Export failed:', error);
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
        console.error('File parsing failed:', error);
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
      console.error('Import failed:', error);
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
    setEditBookCoverUrl(null);
    setError('');
  };

  // Author lookup functions
  const handleFillMissingAuthors = async () => {
    // Determine which books need lookup based on toggle
    const booksNeedingLookup = books.filter(book => {
      const author = (book.author || '').trim().toLowerCase();
      if (!author) return true;
      if (includeUnknownAuthors && author === 'unknown') return true;
      return false;
    });

    const booksWithoutAuthors = booksNeedingLookup;
    if (booksWithoutAuthors.length === 0) {
      setSnackbar({
        open: true,
        message: 'All books already have authors assigned!',
        severity: 'info'
      });
      return;
    }

    // Check OpenLibrary availability first with a quick timeout
    setSnackbar({
      open: true,
      message: 'Checking OpenLibrary availability...',
      severity: 'info'
    });
    
    const isAvailable = await checkOpenLibraryAvailability(3000);
    if (!isAvailable) {
      setSnackbar({
        open: true,
        message: 'OpenLibrary is currently unavailable. Please try again later.',
        severity: 'error'
      });
      return;
    }

    setIsLookingUpAuthors(true);
    setAuthorLookupProgress({ current: 0, total: booksWithoutAuthors.length, book: '' });
    setAuthorLookupResults([]);

    try {
      const results = await batchFindMissingAuthors(booksWithoutAuthors, (progress) => {
        setAuthorLookupProgress(progress);
      });

      setAuthorLookupResults(results);
      setIsLookingUpAuthors(false);
      setShowAuthorResults(true);

      const successCount = results.filter(r => r.success).length;
      const totalCount = results.length;

      setSnackbar({
        open: true,
        message: `Author lookup completed: ${successCount}/${totalCount} authors found`,
        severity: successCount > 0 ? 'success' : 'warning'
      });
    } catch (error) {
      console.error('Error during author lookup:', error);
      setIsLookingUpAuthors(false);
      setSnackbar({
        open: true,
        message: `Author lookup failed: ${error.message}`,
        severity: 'error'
      });
    }
  };

  const handleApplyAuthorUpdates = async () => {
    // Allow both auto-suggested and manually edited authors:
    // We trust whatever is currently in authorLookupResults as the chosen value.
    if (!authorLookupResults || authorLookupResults.length === 0) {
      setSnackbar({
        open: true,
        message: 'No authors to update',
        severity: 'info'
      });
      return;
    }

    let updateCount = 0;
    let errorCount = 0;

    for (const result of authorLookupResults) {
      const chosenAuthor = (result.chosenAuthor ?? result.foundAuthor ?? '').trim();

      // Skip if nothing selected or entered for this book
      if (!chosenAuthor) {
        continue;
      }

      try {
        // Use authenticated helper to include credentials/headers consistently
        const response = await fetchWithAuth(`/api/books/${result.book.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...result.book,
            author: chosenAuthor
          }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        updateCount++;
      } catch (error) {
        console.error(`Error updating book "${result.book.title}":`, error);
        errorCount++;
      }
    }

    await reloadDataFromServer();
    setShowAuthorResults(false);
    setAuthorLookupResults([]);

    setSnackbar({
      open: true,
      message: `Updated ${updateCount} books${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
      severity: errorCount > 0 ? 'warning' : 'success'
    });
  };

  const handleCancelAuthorResults = () => {
    setShowAuthorResults(false);
    setAuthorLookupResults([]);
  };

  const getBooksWithoutAuthors = () => {
    // Used for the "Fill Missing Authors" count button.
    // Includes truly empty authors and explicit "Unknown" markers.
    return books.filter(book => {
      const author = (book.author || '').trim().toLowerCase();
      return !author || author === 'unknown';
    });
  };

  const getBooksWithoutDescriptions = () => {
    // Used for the "Fill Missing Descriptions" count button.
    return books.filter(book => {
      const description = (book.description || '').trim();
      return !description;
    });
  };

  // Description lookup functions
  const handleFillMissingDescriptions = async () => {
    const booksWithoutDescriptions = getBooksWithoutDescriptions();
    if (booksWithoutDescriptions.length === 0) {
      setSnackbar({
        open: true,
        message: 'All books already have descriptions!',
        severity: 'info'
      });
      return;
    }

    // Check OpenLibrary availability first with a quick timeout
    setSnackbar({
      open: true,
      message: 'Checking OpenLibrary availability...',
      severity: 'info'
    });
    
    const isAvailable = await checkOpenLibraryAvailability(3000);
    if (!isAvailable) {
      setSnackbar({
        open: true,
        message: 'OpenLibrary is currently unavailable. Please try again later.',
        severity: 'error'
      });
      return;
    }

    setIsLookingUpDescriptions(true);
    setDescriptionLookupProgress({ current: 0, total: booksWithoutDescriptions.length, book: '' });
    setDescriptionLookupResults([]);

    try {
      const results = await batchFindMissingDescriptions(booksWithoutDescriptions, (progress) => {
        setDescriptionLookupProgress(progress);
      });

      setDescriptionLookupResults(results);
      setIsLookingUpDescriptions(false);
      setShowDescriptionResults(true);

      const successCount = results.filter(r => r.success).length;
      const totalCount = results.length;

      setSnackbar({
        open: true,
        message: `Description lookup completed: ${successCount}/${totalCount} descriptions found`,
        severity: successCount > 0 ? 'success' : 'warning'
      });
    } catch (error) {
      console.error('Error during description lookup:', error);
      setIsLookingUpDescriptions(false);
      setSnackbar({
        open: true,
        message: `Description lookup failed: ${error.message}`,
        severity: 'error'
      });
    }
  };

  const handleApplyDescriptionUpdates = async () => {
    const resultsToApply = descriptionLookupResults.filter(r => r.success && r.foundDescription);
    
    if (resultsToApply.length === 0) {
      setSnackbar({
        open: true,
        message: 'No descriptions to update',
        severity: 'info'
      });
      return;
    }

    let updateCount = 0;
    let errorCount = 0;

    for (const result of resultsToApply) {
      try {
        const response = await fetchWithAuth(`/api/books/${result.book.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...result.book,
            description: result.foundDescription
          }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        updateCount++;
      } catch (error) {
        console.error(`Error updating book "${result.book.title}":`, error);
        errorCount++;
      }
    }

    await reloadDataFromServer();
    setShowDescriptionResults(false);
    setDescriptionLookupResults([]);

    setSnackbar({
      open: true,
      message: `Updated ${updateCount} books${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
      severity: errorCount > 0 ? 'warning' : 'success'
    });
  };

  const handleCancelDescriptionResults = () => {
    setShowDescriptionResults(false);
    setDescriptionLookupResults([]);
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

  return (
    <Paper sx={{ p: 3, mt: 3 }}>
      <Typography variant="h6" gutterBottom>
        <LibraryBooksIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
        Manage Books
      </Typography>

      <Box component="form" onSubmit={handleAddBook} sx={{ mt: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={3}>
            <TextField
              label="Book Title"
              value={newBookTitle}
              onChange={(e) => setNewBookTitle(e.target.value)}
              fullWidth
              size="small"
              required
            />
          </Grid>

          <Grid item xs={12} sm={2}>
            <TextField
              label="Author (Optional)"
              value={newBookAuthor}
              onChange={(e) => setNewBookAuthor(e.target.value)}
              fullWidth
              size="small"
            />
          </Grid>

          <Grid item xs={12} sm={2}>
            <TextField
              label="Reading Level (Optional)"
              value={newBookReadingLevel}
              onChange={(e) => setNewBookReadingLevel(e.target.value)}
              fullWidth
              size="small"
            />
          </Grid>

          <Grid item xs={12} sm={2}>
            <TextField
              label="Age Range (Optional)"
              value={newBookAgeRange}
              onChange={(e) => setNewBookAgeRange(e.target.value)}
              fullWidth
              size="small"
              placeholder="e.g., 6-9"
            />
          </Grid>

          <Grid item xs={12} sm={3}>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
              startIcon={<SaveIcon />}
            >
              Add Book
            </Button>
          </Grid>

          {error && (
            <Grid item xs={12}>
              <Typography color="error" variant="body2">
                {error}
              </Typography>
            </Grid>
          )}
        </Grid>
      </Box>

      {/* Import/Export Section */}
      <Box sx={{ mt: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Import/Export Box */}
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
          }}
        >
          <Typography variant="subtitle2" gutterBottom sx={{ mb: 0 }}>
            Import/Export Books
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleExportJSON}
              disabled={books.length === 0}
              size="small"
              fullWidth
            >
              Export JSON
            </Button>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleExportCSV}
              disabled={books.length === 0}
              size="small"
              fullWidth
            >
              Export CSV
            </Button>
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={handleImportClick}
              size="small"
              fullWidth
            >
              Import Books
            </Button>
          </Box>
          <input
            type="file"
            accept=".json,.csv"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </Paper>

        {/* Spacer to push AI lookup boxes to the right */}
        <Box sx={{ flex: 1 }} />

        {/* Author Lookup Box */}
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            borderColor: 'secondary.main',
            borderStyle: 'dashed'
          }}
        >
          <Button
            variant="outlined"
            startIcon={isLookingUpAuthors ? <CircularProgress size={20} /> : <PersonSearchIcon />}
            onClick={handleFillMissingAuthors}
            disabled={isLookingUpAuthors || books.length === 0}
            color="secondary"
            size="small"
          >
            {isLookingUpAuthors
              ? 'Finding Authors...'
              : `Fill Missing Authors (${getBooksWithoutAuthors().length})`}
          </Button>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={includeUnknownAuthors}
                onChange={(e) => setIncludeUnknownAuthors(e.target.checked)}
              />
            }
            label={<Typography variant="caption">Include 'Unknown' authors</Typography>}
            sx={{ ml: 0, mr: 0 }}
          />
        </Paper>

        {/* Description Lookup Box */}
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            borderColor: 'info.main',
            borderStyle: 'dashed'
          }}
        >
          <Button
            variant="outlined"
            startIcon={isLookingUpDescriptions ? <CircularProgress size={20} /> : <DescriptionIcon />}
            onClick={handleFillMissingDescriptions}
            disabled={isLookingUpDescriptions || books.length === 0}
            color="info"
            size="small"
          >
            {isLookingUpDescriptions
              ? 'Finding Descriptions...'
              : `Fill Missing Descriptions (${getBooksWithoutDescriptions().length})`}
          </Button>
        </Paper>
      </Box>

      {/* Author Lookup Progress */}
      {isLookingUpAuthors && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" gutterBottom>
            Looking up authors: {authorLookupProgress.current}/{authorLookupProgress.total}
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Current: {authorLookupProgress.book}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={(authorLookupProgress.current / authorLookupProgress.total) * 100}
            sx={{ mb: 1 }}
          />
        </Box>
      )}

      {/* Description Lookup Progress */}
      {isLookingUpDescriptions && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" gutterBottom>
            Looking up descriptions: {descriptionLookupProgress.current}/{descriptionLookupProgress.total}
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Current: {descriptionLookupProgress.book}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={(descriptionLookupProgress.current / descriptionLookupProgress.total) * 100}
            color="info"
            sx={{ mb: 1 }}
          />
        </Box>
      )}

      {error && (
        <Grid item xs={12}>
          <Alert severity="error">{error}</Alert>
        </Grid>
      )}

      <Box sx={{ mt: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle1">
            Existing Books ({books.length})
          </Typography>
          
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
                Showing {Math.min((currentPage - 1) * booksPerPage + 1, books.length)}-{Math.min(currentPage * booksPerPage, books.length)} of {books.length}
              </Typography>
            </Box>
          )}
        </Box>

        {books.length === 0 ? (
          <Typography variant="body2">No books created yet.</Typography>
        ) : (
          <>
            <List>
              {getPaginatedBooks().map((book) => (
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
            
            {getTotalPages() > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Pagination
                  count={getTotalPages()}
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
            {/* Cover and Description Row */}
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
                {editBookCoverUrl ? (
                  <Box
                    component="img"
                    src={editBookCoverUrl}
                    alt={`Cover of ${editBookTitle}`}
                    sx={{
                      width: '100%',
                      maxHeight: 200,
                      objectFit: 'contain',
                      borderRadius: 1,
                      boxShadow: 2
                    }}
                  />
                ) : (
                  <Box
                    sx={{
                      width: '100%',
                      height: 180,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'grey.100',
                      borderRadius: 1,
                      border: '1px dashed',
                      borderColor: 'grey.300'
                    }}
                  >
                    <Typography variant="body2" color="text.secondary" align="center">
                      No cover
                    </Typography>
                  </Box>
                )}
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
                  rows={7}
                  placeholder="Book description (can be fetched from OpenLibrary)"
                  sx={{ height: '100%' }}
                />
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
          <Button onClick={handleUpdateBook} variant="contained" color="primary">
            Save
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

      {/* Author Lookup Results Dialog */}
      <Dialog open={showAuthorResults} onClose={handleCancelAuthorResults} fullWidth maxWidth="md">
        <DialogTitle>Author Lookup Results</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Found authors for {authorLookupResults.filter(r => r.success).length} out of {authorLookupResults.length} books.
            Click "Apply Updates" to save the found authors to your books.
          </DialogContentText>
          
          <List>
            {authorLookupResults.map((result, index) => (
                          <ListItem key={index} divider alignItems="flex-start">
                            <ListItemText
                              primary={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                  <Typography variant="subtitle2">{result.book.title}</Typography>
                                  {result.success ? (
                                    <Chip label="Suggestions found" color="success" size="small" />
                                  ) : (
                                    <Chip label="No suggestions" color="error" size="small" />
                                  )}
                                </Box>
                              }
                              secondary={
                                <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                  {Array.isArray(result.candidates) && result.candidates.length > 0 ? (
                                    <>
                                      <Typography variant="body2" color="text.secondary">
                                        Select an author or enter manually:
                                      </Typography>
                                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                        {result.candidates.map((candidate, cIndex) => (
                                          <Box
                                            key={cIndex}
                                            sx={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: 1
                                            }}
                                          >
                                            {candidate.coverUrl && (
                                              <img
                                                src={candidate.coverUrl}
                                                alt={candidate.sourceTitle || result.book.title}
                                                style={{
                                                  width: 56,
                                                  height: 84,
                                                  objectFit: 'cover',
                                                  borderRadius: 4,
                                                  boxShadow: '0 1px 4px rgba(0,0,0,0.35)'
                                                }}
                                              />
                                            )}
                                            <Chip
                                              label={`${candidate.name}${
                                                candidate.sourceTitle ? ` (${candidate.sourceTitle})` : ''
                                              }`}
                                              variant={
                                                (result.chosenAuthor || result.foundAuthor) === candidate.name
                                                  ? 'filled'
                                                  : 'outlined'
                                              }
                                              color={
                                                (result.chosenAuthor || result.foundAuthor) === candidate.name
                                                  ? 'primary'
                                                  : 'default'
                                              }
                                              size="small"
                                              onClick={() => {
                                                setAuthorLookupResults(prev =>
                                                  prev.map((r, i) =>
                                                    i === index
                                                      ? { ...r, chosenAuthor: candidate.name }
                                                      : r
                                                  )
                                                );
                                              }}
                                            />
                                          </Box>
                                        ))}
                                      </Box>
                                    </>
                                  ) : result.success && result.foundAuthor ? (
                                    <Typography variant="body2" color="text.secondary">
                                      Suggested author: {result.foundAuthor}
                                    </Typography>
                                  ) : (
                                    <Typography variant="body2" color="error">
                                      {result.error || 'No matching author candidates found'}
                                    </Typography>
                                  )}
            
                                  {/* Manual override input */}
                                  <Box sx={{ mt: 1, maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                    <Typography variant="caption" color="text.secondary">
                                      Or type an author name, or choose "Unknown":
                                    </Typography>
                                    <input
                                      type="text"
                                      value={result.chosenAuthor ?? result.foundAuthor ?? result.book.author ?? ''}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        setAuthorLookupResults(prev =>
                                          prev.map((r, i) =>
                                            i === index
                                              ? { ...r, chosenAuthor: value }
                                              : r
                                          )
                                        );
                                      }}
                                      style={{
                                        width: '100%',
                                        padding: '6px 8px',
                                        fontSize: '0.8125rem',
                                        borderRadius: 4,
                                        border: '1px solid rgba(0,0,0,0.23)'
                                      }}
                                    />
                                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                                      <Chip
                                        label="Set as Unknown"
                                        variant={(result.chosenAuthor || '').trim().toLowerCase() === 'unknown' ? 'filled' : 'outlined'}
                                        size="small"
                                        onClick={() => {
                                          setAuthorLookupResults(prev =>
                                            prev.map((r, i) =>
                                              i === index
                                                ? { ...r, chosenAuthor: 'Unknown' }
                                                : r
                                            )
                                          );
                                        }}
                                      />
                                      <Chip
                                        label="Clear selection"
                                        variant={!(result.chosenAuthor || '').trim() ? 'filled' : 'outlined'}
                                        size="small"
                                        onClick={() => {
                                          setAuthorLookupResults(prev =>
                                            prev.map((r, i) =>
                                              i === index
                                                ? { ...r, chosenAuthor: '' }
                                                : r
                                            )
                                          );
                                        }}
                                      />
                                    </Box>
                                  </Box>
                                </Box>
                              }
                            />
                          </ListItem>
                        ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelAuthorResults}>Cancel</Button>
          <Button
            onClick={handleApplyAuthorUpdates}
            variant="contained"
            color="primary"
            disabled={authorLookupResults.filter(r => r.success).length === 0}
          >
            Apply Updates ({authorLookupResults.filter(r => r.success).length})
          </Button>
        </DialogActions>
      </Dialog>

      {/* Description Lookup Results Dialog */}
      <Dialog open={showDescriptionResults} onClose={handleCancelDescriptionResults} fullWidth maxWidth="md">
        <DialogTitle>Description Lookup Results</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Found descriptions for {descriptionLookupResults.filter(r => r.success).length} out of {descriptionLookupResults.length} books.
            Click "Apply Updates" to save the found descriptions to your books.
          </DialogContentText>
          
          <List>
            {descriptionLookupResults.map((result, index) => (
              <ListItem key={index} divider alignItems="flex-start">
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="subtitle2">{result.book.title}</Typography>
                      {result.book.author && (
                        <Chip label={`by ${result.book.author}`} size="small" variant="outlined" />
                      )}
                      {result.success ? (
                        <Chip label="Description found" color="success" size="small" />
                      ) : (
                        <Chip label="No description" color="error" size="small" />
                      )}
                    </Box>
                  }
                  secondary={
                    <Box sx={{ mt: 1 }}>
                      {result.foundDescription ? (
                        <Typography variant="body2" color="text.secondary" sx={{
                          maxHeight: 100,
                          overflow: 'auto',
                          backgroundColor: 'action.hover',
                          p: 1,
                          borderRadius: 1
                        }}>
                          {result.foundDescription}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="error">
                          {result.error || 'No description found for this book'}
                        </Typography>
                      )}
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDescriptionResults}>Cancel</Button>
          <Button
            onClick={handleApplyDescriptionUpdates}
            variant="contained"
            color="primary"
            disabled={descriptionLookupResults.filter(r => r.success).length === 0}
          >
            Apply Updates ({descriptionLookupResults.filter(r => r.success).length})
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
    </Paper>
  );
};

export default BookManager;