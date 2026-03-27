import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Autocomplete,
  TextField,
  IconButton,
  InputAdornment,
  Typography,
  CircularProgress,
  Box,
} from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import ScanBookFlow from '../books/ScanBookFlow';

const BookAutocomplete = ({
  value,
  onChange,
  onBookCreated,
  onBookCreationStart,
  label = 'Book (Optional)',
  placeholder = 'Select or type book title...',
  priorityBookIds = [],
}) => {
  const { fetchWithAuth } = useAuth();
  const { books, findOrCreateBook } = useData();
  const [inputValue, setInputValue] = useState('');
  const [debouncedInputValue, setDebouncedInputValue] = useState('');
  const [selectedBook, setSelectedBook] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  // External search state
  const [externalResults, setExternalResults] = useState([]);
  const [externalLoading, setExternalLoading] = useState(false);
  const externalAbortRef = useRef(null);

  // Local filtering debounce (fast, 150ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedInputValue(inputValue);
    }, 150);
    return () => clearTimeout(timer);
  }, [inputValue]);

  // External search (slower debounce, 400ms, min 3 chars)
  useEffect(() => {
    // Cancel any in-flight request
    if (externalAbortRef.current) {
      externalAbortRef.current.abort();
      externalAbortRef.current = null;
    }

    const term = inputValue.trim();
    if (term.length < 3 || selectedBook) {
      setExternalResults([]);
      setExternalLoading(false);
      return;
    }

    setExternalLoading(true);

    const timer = setTimeout(() => {
      const controller = new AbortController();
      externalAbortRef.current = controller;

      fetchWithAuth(`/api/books/search-external?q=${encodeURIComponent(term)}&limit=8`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((data) => {
          if (!controller.signal.aborted) {
            setExternalResults(data.results || []);
            setExternalLoading(false);
          }
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            setExternalLoading(false);
            setExternalResults([]);
          }
        });
    }, 400);

    return () => {
      clearTimeout(timer);
      if (externalAbortRef.current) {
        externalAbortRef.current.abort();
        externalAbortRef.current = null;
      }
    };
  }, [inputValue, selectedBook, fetchWithAuth]);

  // Sync internal selectedBook with external value
  useEffect(() => {
    if (!value) {
      setSelectedBook(null);
      return;
    }

    if (value.id) {
      setSelectedBook(value);
    } else if (typeof value === 'string') {
      setSelectedBook(null);
      setInputValue(value);
    }
  }, [value]);

  // We handle filtering ourselves in computedOptions, so this just passes through
  const filterOptions = (options) => options;

  // Parse input to extract title and potential author
  const parseBookInput = (input) => {
    const parts = input
      .split('@')
      .map((s) => s.trim())
      .filter(Boolean);

    if (parts.length > 1 && input.includes('@')) {
      // Format: "Title @ Author"
      return {
        title: parts[0],
        author: parts[1] || null,
      };
    }

    // Just title
    return {
      title: input.trim(),
      author: null,
    };
  };

  // Handle selection from dropdown
  const handleSelection = useCallback(
    async (event, newValue, reason) => {
      if (typeof newValue === 'string') {
        // User typed and pressed Enter - keep existing behavior:
        // try create/find directly for speed
        const bookData = parseBookInput(newValue);

        if (bookData.title && bookData.title.length > 0) {
          setIsCreating(true);
          if (onBookCreationStart) {
            onBookCreationStart();
          }
          try {
            const book = await findOrCreateBook(bookData.title, bookData.author);
            setSelectedBook(book);
            setInputValue(`${book.title}${book.author ? ` by ${book.author}` : ''}`);
            if (onChange) onChange(book);
            if (onBookCreated) onBookCreated(book);
          } catch (error) {
            console.error('Error creating/finding book:', error);
          } finally {
            setIsCreating(false);
          }
        }
      } else if (newValue && newValue._external) {
        // User selected an external search result - create book with metadata
        setIsCreating(true);
        if (onBookCreationStart) {
          onBookCreationStart();
        }
        try {
          const metadata = {};
          if (newValue.isbn) metadata.isbn = newValue.isbn;
          if (newValue.publicationYear) metadata.publicationYear = newValue.publicationYear;

          const book = await findOrCreateBook(newValue.title, newValue.author, metadata);
          setSelectedBook(book);
          setInputValue(`${book.title}${book.author ? ` by ${book.author}` : ''}`);
          if (onChange) onChange(book);
          if (onBookCreated) onBookCreated(book);
        } catch (error) {
          console.error('Error creating book from external result:', error);
        } finally {
          setIsCreating(false);
        }
      } else if (newValue) {
        // User selected existing local book
        const displayValue = `${newValue.title}${newValue.author ? ` by ${newValue.author}` : ''}`;
        setSelectedBook(newValue);
        setInputValue(displayValue);
        if (onChange) onChange(newValue);
        setIsCreating(false);
      } else {
        // User cleared selection
        setSelectedBook(null);
        setInputValue('');
        if (onChange) onChange(null);
        setIsCreating(false);
      }
    },
    [findOrCreateBook, onChange, onBookCreated, onBookCreationStart]
  );

  // Handle input change
  const handleInputChange = useCallback((event, newInputValue) => {
    setInputValue(newInputValue);
  }, []);

  // Get book option display
  const getOptionLabel = (option) => {
    if (typeof option === 'string') {
      return option;
    }

    if (option.title) {
      return `${option.title}${option.author ? ` by ${option.author}` : ''}`;
    }

    return '';
  };

  // Build options: local books first, then external results
  const computedOptions = useMemo(() => {
    const term = debouncedInputValue.trim().toLowerCase();

    const filteredBooks = books.filter((book) => {
      const displayText = `${book.title}${book.author ? ` ${book.author}` : ''}`.toLowerCase();
      return term ? displayText.includes(term) : true;
    });

    // Sort books: priority books first, then alphabetically
    const prioritySet = new Set(priorityBookIds);
    const sortedBooks = [...filteredBooks].sort((a, b) => {
      const aIsPriority = prioritySet.has(a.id);
      const bIsPriority = prioritySet.has(b.id);

      if (aIsPriority && !bIsPriority) return -1;
      if (!aIsPriority && bIsPriority) return 1;

      // Within same priority group, sort alphabetically
      return a.title.localeCompare(b.title);
    });

    const localOptions = sortedBooks.slice(0, 100);

    // Append external results that aren't already in local results
    // Normalize titles for comparison: lowercase, collapse quotes/apostrophes, trim
    const normalizeTitle = (t) =>
      t
        .toLowerCase()
        .replace(/[\u2018\u2019\u201C\u201D'"`]/g, "'")
        .trim();
    if (externalResults.length > 0 && term.length >= 3) {
      const localTitles = new Set(localOptions.map((b) => normalizeTitle(b.title)));
      const externalOptions = externalResults
        .filter((r) => !localTitles.has(normalizeTitle(r.title)))
        .map((r, i) => ({
          ...r,
          id: `_ext_${i}_${r.title}`,
          _external: true,
        }));

      if (externalOptions.length > 0) {
        // Add a group separator
        return [...localOptions, { _separator: true, id: '_sep', title: '' }, ...externalOptions];
      }
    }

    return localOptions;
  }, [books, debouncedInputValue, priorityBookIds, externalResults]);

  return (
    <>
      <Autocomplete
        value={selectedBook}
        onChange={handleSelection}
        inputValue={inputValue}
        onInputChange={handleInputChange}
        options={computedOptions}
        getOptionLabel={getOptionLabel}
        getOptionDisabled={(option) => !!option._separator}
        filterOptions={filterOptions}
        selectOnFocus
        clearOnBlur
        handleHomeEndKeys
        freeSolo
        loading={isCreating || externalLoading}
        loadingText={externalLoading ? 'Searching online...' : 'Creating book...'}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder={isCreating ? 'Creating book...' : placeholder}
            fullWidth
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {externalLoading && (
                    <CircularProgress color="inherit" size={18} sx={{ mr: 0.5 }} />
                  )}
                  {params.InputProps.endAdornment}
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setScanOpen(true)}
                      size="small"
                      title="Scan ISBN barcode"
                    >
                      <QrCodeScannerIcon />
                    </IconButton>
                  </InputAdornment>
                </>
              ),
            }}
            helperText={
              isCreating
                ? 'Creating new book...'
                : inputValue && !selectedBook && inputValue.length > 0
                  ? 'Type @author to specify author. Press Enter to create a new book.'
                  : ''
            }
          />
        )}
        renderOption={(props, option) => {
          const { key, ...restProps } = props;

          // Render group separator
          if (option._separator) {
            return (
              <li key="_sep" style={{ padding: '4px 16px', pointerEvents: 'none' }}>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase' }}
                >
                  From OpenLibrary
                </Typography>
              </li>
            );
          }

          const isPriority = priorityBookIds.includes(option.id);
          const isExternal = option._external;

          return (
            <li {...restProps} key={option.id}>
              <Box sx={{ width: '100%' }}>
                <span style={{ fontWeight: 500 }}>
                  {option.title}
                  {isPriority && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: '0.75rem',
                        color: 'info.main',
                        fontWeight: 'normal',
                      }}
                    >
                      (previously read)
                    </span>
                  )}
                </span>
                {option.author && (
                  <Typography variant="body2" color="text.secondary" component="span">
                    {' '}
                    by {option.author}
                  </Typography>
                )}
                {isExternal && option.publicationYear && (
                  <Typography variant="body2" color="text.secondary" component="span">
                    {' '}
                    ({option.publicationYear})
                  </Typography>
                )}
              </Box>
            </li>
          );
        }}
        noOptionsText={
          inputValue.trim()
            ? inputValue.trim().length < 3
              ? 'Keep typing to search online...'
              : 'No matches found. Press Enter to create a new book.'
            : 'Start typing to search or create a book...'
        }
        sx={{
          '& .MuiAutocomplete-inputRoot': {
            height: 56, // Match height with other fields
          },
        }}
      />

      <ScanBookFlow
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onBookSelected={(book) => {
          setScanOpen(false);
          setSelectedBook(book);
          setInputValue(`${book.title}${book.author ? ` by ${book.author}` : ''}`);
          if (onChange) onChange(book);
          if (onBookCreated) onBookCreated(book);
        }}
      />
    </>
  );
};

export default BookAutocomplete;
