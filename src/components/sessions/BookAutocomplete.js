import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Autocomplete,
  TextField,
  IconButton,
  InputAdornment
} from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import { useAppContext } from '../../contexts/AppContext';
import ScanBookFlow from '../books/ScanBookFlow';

const BookAutocomplete = ({
  value,
  onChange,
  onBookCreated,
  onBookCreationStart,
  label = 'Book (Optional)',
  placeholder = 'Select or type book title...',
  priorityBookIds = []
}) => {
  const { books, findOrCreateBook } = useAppContext();
  const [inputValue, setInputValue] = useState('');
  const [debouncedInputValue, setDebouncedInputValue] = useState('');
  const [selectedBook, setSelectedBook] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedInputValue(inputValue);
    }, 150);
    return () => clearTimeout(timer);
  }, [inputValue]);

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
    const parts = input.split('@').map(s => s.trim()).filter(Boolean);

    if (parts.length > 1 && input.includes('@')) {
      // Format: "Title @ Author"
      return {
        title: parts[0],
        author: parts[1] || null
      };
    }

    // Just title
    return {
      title: input.trim(),
      author: null
    };
  };

  // Handle selection from dropdown
  const handleSelection = useCallback(async (event, newValue, reason) => {
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
    } else if (newValue) {
      // User selected existing book
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
  }, [findOrCreateBook, onChange, onBookCreated, onBookCreationStart]);

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

  // Build options: filtered books with priority books at the top
  const computedOptions = useMemo(() => {
    const term = debouncedInputValue.trim().toLowerCase();

    const filteredBooks = books.filter(book => {
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

    return sortedBooks;
  }, [books, debouncedInputValue, priorityBookIds]);

  return (
    <>
      <Autocomplete
        value={selectedBook}
        onChange={handleSelection}
        inputValue={inputValue}
        onInputChange={handleInputChange}
        options={computedOptions}
        getOptionLabel={getOptionLabel}
        filterOptions={filterOptions}
        selectOnFocus
        clearOnBlur
        handleHomeEndKeys
        freeSolo
        loading={isCreating}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder={
              isCreating
                ? 'Creating book...'
                : placeholder
            }
            fullWidth
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
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
          const isPriority = priorityBookIds.includes(option.id);

          return (
            <li {...restProps} key={option.id}>
              <div className="flex flex-col" style={{ width: '100%' }}>
                <span className="font-medium">
                  {option.title}
                  {isPriority && (
                    <span style={{
                      marginLeft: 8,
                      fontSize: '0.75rem',
                      color: '#1976d2',
                      fontWeight: 'normal'
                    }}>
                      (previously read)
                    </span>
                  )}
                </span>
                {option.author && (
                  <span className="text-sm text-gray-500"> by {option.author}</span>
                )}
              </div>
            </li>
          );
        }}
        noOptionsText={
          inputValue.trim()
            ? 'No matches found. Press Enter to create a new book.'
            : 'Start typing to search or create a book...'
        }
        sx={{
          '& .MuiAutocomplete-inputRoot': {
            height: 56 // Match height with other fields
          }
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