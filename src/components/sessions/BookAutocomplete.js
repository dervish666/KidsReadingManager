import React, { useState, useEffect, useCallback } from 'react';
import {
  Autocomplete,
  TextField
} from '@mui/material';
import { useAppContext } from '../../contexts/AppContext';
import AddBookModal from '../books/AddBookModal';

const BookAutocomplete = ({
  value,
  onChange,
  onBookCreated,
  onBookCreationStart,
  label = 'Book (Optional)',
  placeholder = 'Select or type book title...'
}) => {
  const { books, findOrCreateBook } = useAppContext();
  const [inputValue, setInputValue] = useState('');
  const [selectedBook, setSelectedBook] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [pendingTitleForModal, setPendingTitleForModal] = useState('');

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

  // Custom filter that preserves the "Add new book" option
  // We handle filtering ourselves in computedOptions, so this just passes through
  const filterOptions = (options, state) => {
    // Return options as-is since we already filter in computedOptions
    return options;
  };

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

  // Open modal for manual creation when no match is found
  const openAddBookModal = (initialTitle) => {
    setPendingTitleForModal(initialTitle || inputValue || '');
    setAddModalOpen(true);
    if (onBookCreationStart) {
      onBookCreationStart();
    }
  };

  // Handle selection from dropdown
  const handleSelection = useCallback(async (event, newValue, reason) => {
    // If user selects the special "Add new book" option
    if (newValue && newValue.inputValue && newValue.type === 'add-new') {
      openAddBookModal(newValue.inputValue);
      return;
    }

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

    if (option.inputValue && option.type === 'add-new') {
      return option.label || option.inputValue;
    }

    if (option.title) {
      return `${option.title}${option.author ? ` by ${option.author}` : ''}`;
    }

    return '';
  };

  // Build options: filtered books plus conditional "Add new" option
  const computedOptions = React.useMemo(() => {
    const term = inputValue.trim().toLowerCase();

    const existingBooks = books.filter(book => {
      const displayText = `${book.title}${book.author ? ` ${book.author}` : ''}`.toLowerCase();
      return term ? displayText.includes(term) : true;
    });

    // Always show "Add new book" option when there is input, regardless of matches
    // This option will always be the last item in the list
    if (term) {
      return [
        ...existingBooks,
        {
          type: 'add-new',
          inputValue: inputValue,
          label: `Add "${inputValue}" as a new book`
        }
      ];
    }

    return existingBooks;
  }, [books, inputValue]);

  const handleModalClose = () => {
    setAddModalOpen(false);
    setPendingTitleForModal('');
    // Do not change isCreating here; it is managed by modal submit
  };

  const handleModalBookCreated = (book) => {
    // Called by AddBookModal once book is successfully created
    if (!book) return;

    const displayValue = `${book.title}${book.author ? ` by ${book.author}` : ''}`;
    setSelectedBook(book);
    setInputValue(displayValue);
    setIsCreating(false);
    setAddModalOpen(false);
    setPendingTitleForModal('');

    if (onChange) onChange(book);
    if (onBookCreated) onBookCreated(book);
  };

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
            helperText={
              isCreating
                ? 'Creating new book...'
                : inputValue && !selectedBook && inputValue.length > 0
                  ? 'Type @author to specify author, or choose "Add" to quickly create this book'
                  : ''
            }
          />
        )}
        renderOption={(props, option) => {
          const { key, ...restProps } = props;

          // Render the "Add new" option with clear affordance
          if (option.type === 'add-new') {
            return (
              <li {...restProps} key="add-new-book-option">
                <strong>{option.label}</strong>
              </li>
            );
          }

          return (
            <li {...restProps} key={option.id}>
              <div className="flex flex-col">
                <span className="font-medium">{option.title}</span>
                {option.author && (
                  <span className="text-sm text-gray-500"> by {option.author}</span>
                )}
              </div>
            </li>
          );
        }}
        noOptionsText={
          inputValue.trim()
            ? `No matches found. Select 'Add "${inputValue}" as a new book' to create it.`
            : 'Start typing to search or create a book...'
        }
        sx={{
          '& .MuiAutocomplete-inputRoot': {
            height: 56 // Match height with other fields
          }
        }}
      />

      <AddBookModal
        open={addModalOpen}
        initialTitle={pendingTitleForModal}
        onClose={handleModalClose}
        onBookCreated={handleModalBookCreated}
      />
    </>
  );
};

export default BookAutocomplete;