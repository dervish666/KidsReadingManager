import React, { useState, useEffect, useCallback } from 'react';
import {
  Autocomplete,
  TextField,
  createFilterOptions
} from '@mui/material';
import { useAppContext } from '../../contexts/AppContext';

const BookAutocomplete = ({ value, onChange, onBookCreated, label = "Book (Optional)", placeholder = "Select or type book title..." }) => {
  const { books, findOrCreateBook } = useAppContext();
  const [inputValue, setInputValue] = useState('');
  const [selectedBook, setSelectedBook] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  // Filter options to exclude duplicates (case insensitive)
  const filterOptions = createFilterOptions({
    stringify: (option) => `${option.title} ${option.author || ''}`.toLowerCase(),
  });

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
  const handleSelection = useCallback((event, newValue) => {
    if (typeof newValue === 'string') {
      // User typed and pressed enter - parse and create/find book
      setIsCreating(true);
      const bookData = parseBookInput(newValue);

      if (bookData.title && bookData.title.length > 0) {
        findOrCreateBook(bookData.title, bookData.author)
          .then((book) => {
            setSelectedBook(book);
            onChange && onChange(book);
            onBookCreated && onBookCreated(book);
            setInputValue(`${book.title}${book.author ? ` by ${book.author}` : ''}`);
            setIsCreating(false);
          })
          .catch((error) => {
            console.error('Error creating/finding book:', error);
            setIsCreating(false);
          });
      }
    } else if (newValue) {
      // User selected existing book
      const displayValue = `${newValue.title}${newValue.author ? ` by ${newValue.author}` : ''}`;
      setSelectedBook(newValue);
      setInputValue(displayValue);
      onChange && onChange(newValue);
      setIsCreating(false);
    } else {
      // User cleared selection
      setSelectedBook(null);
      setInputValue('');
      onChange && onChange(null);
      setIsCreating(false);
    }
  }, [findOrCreateBook, onChange, onBookCreated]);

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

  // Filter books based on input and show "Add new book" option
  const filteredOptions = React.useMemo(() => {
    const filterRegex = new RegExp(`(.*?)(${inputValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(.*)`, 'gi');

    const existingBooks = books.filter(book => {
      const displayText = `${book.title}${book.author ? ` ${book.author}` : ''}`.toLowerCase();
      return displayText.includes(inputValue.toLowerCase());
    });

    return existingBooks;
  }, [books, inputValue]);

  return (
    <Autocomplete
      value={selectedBook}
      onChange={handleSelection}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      options={filteredOptions}
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
          placeholder={isCreating ? "Creating book..." : placeholder}
          fullWidth
          helperText={isCreating ? "Creating new book..." : inputValue && !selectedBook && inputValue.length > 0 ?
            "Type @author to specify author, or just book title" : ""}
        />
      )}
      renderOption={(props, option) => {
        const { ...restProps } = props;
        return (
          <li {...restProps} key={option.id}>
            <div className="flex flex-col">
              <span className="font-medium">{option.title}</span>
              {option.author && (
                <span className="text-sm text-gray-500">by {option.author}</span>
              )}
            </div>
          </li>
        );
      }}
      noOptionsText={
        inputValue.trim() ?
          `Press Enter to create "${inputValue}" as new book` :
          "Start typing to search or create a book..."
      }
      sx={{
        '& .MuiAutocomplete-inputRoot': {
          height: 56 // Match height with other fields
        }
      }}
    />
  );
};

export default BookAutocomplete;