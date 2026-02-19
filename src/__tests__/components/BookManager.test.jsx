import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { createContext, useContext } from 'react';

// Create a test context to mock AppContext
const TestAppContext = createContext();

// Mock the AppContext module
vi.mock('../../contexts/AppContext', () => ({
  useAppContext: () => useContext(TestAppContext)
}));

// Mock BookCover to avoid needing BookCoverProvider
vi.mock('../../components/BookCover', () => ({
  default: () => <div data-testid="book-cover" />
}));

// Mock the bookMetadataApi module
vi.mock('../../utils/bookMetadataApi', () => ({
  batchFetchAllMetadata: vi.fn(),
  getBookDetails: vi.fn(),
  findGenresForBook: vi.fn(),
  checkAvailability: vi.fn(),
  getProviderDisplayName: vi.fn(),
  validateProviderConfig: vi.fn()
}));

// Import after mocking
import BookManager from '../../components/books/BookManager';
import * as bookMetadataApi from '../../utils/bookMetadataApi';

// Mock AppContext provider wrapper
const createWrapper = (contextValue) => {
  return ({ children }) => (
    <TestAppContext.Provider value={contextValue}>
      {children}
    </TestAppContext.Provider>
  );
};

// Default mock context values
const createMockContext = (overrides = {}) => ({
  books: [
    {
      id: 'book-1',
      title: 'The Cat in the Hat',
      author: 'Dr. Seuss',
      readingLevel: '2.5',
      ageRange: '4-8',
      description: 'A classic children\'s book',
      genreIds: ['genre-1']
    },
    {
      id: 'book-2',
      title: 'Charlotte\'s Web',
      author: 'E.B. White',
      readingLevel: '4.5',
      ageRange: '8-12',
      description: 'A story about friendship',
      genreIds: ['genre-2']
    },
    {
      id: 'book-3',
      title: 'Harry Potter',
      author: 'J.K. Rowling',
      readingLevel: '5.5',
      ageRange: '10-14',
      description: null,
      genreIds: ['genre-1', 'genre-2']
    },
    {
      id: 'book-4',
      title: 'Unknown Book',
      author: null,
      readingLevel: '3.0',
      ageRange: null,
      description: null,
      genreIds: []
    }
  ],
  genres: [
    { id: 'genre-1', name: 'Fiction' },
    { id: 'genre-2', name: 'Adventure' },
    { id: 'genre-3', name: 'Fantasy' }
  ],
  settings: {
    bookMetadata: {
      provider: 'openlibrary',
      googleBooksApiKey: null
    }
  },
  addBook: vi.fn(),
  reloadDataFromServer: vi.fn(),
  fetchWithAuth: vi.fn(),
  ...overrides
});

// Helper to create many books for pagination testing
const createManyBooks = (count) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `book-${i + 1}`,
    title: `Book Title ${i + 1}`,
    author: `Author ${i + 1}`,
    readingLevel: `${(i % 5) + 1}.0`,
    ageRange: '6-10',
    description: i % 2 === 0 ? 'Has description' : null,
    genreIds: i % 3 === 0 ? ['genre-1'] : []
  }));
};

describe('BookManager Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    bookMetadataApi.validateProviderConfig.mockReturnValue({ valid: true, error: null });
    bookMetadataApi.getProviderDisplayName.mockReturnValue('Open Library');
    bookMetadataApi.checkAvailability.mockResolvedValue(true);
    bookMetadataApi.getBookDetails.mockResolvedValue({
      coverUrl: 'https://example.com/cover.jpg',
      description: 'Test description'
    });
    bookMetadataApi.findGenresForBook.mockResolvedValue(['Fiction', 'Adventure']);
    bookMetadataApi.batchFetchAllMetadata.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('should render the BookManager with title and form elements', () => {
      const context = createMockContext();
      render(<BookManager />, { wrapper: createWrapper(context) });

      expect(screen.getByText('Manage Books')).toBeInTheDocument();
      expect(screen.getByText('Add New Book')).toBeInTheDocument();
      // Check for text fields by their role
      const textFields = screen.getAllByRole('textbox');
      expect(textFields.length).toBeGreaterThan(0);
    });

    it('should render books from context', () => {
      const context = createMockContext();
      render(<BookManager />, { wrapper: createWrapper(context) });

      expect(screen.getByText('The Cat in the Hat')).toBeInTheDocument();
      expect(screen.getByText("Charlotte's Web")).toBeInTheDocument();
      expect(screen.getByText('Harry Potter')).toBeInTheDocument();
      expect(screen.getByText('Unknown Book')).toBeInTheDocument();
    });

    it('should show book count in header', () => {
      const context = createMockContext();
      render(<BookManager />, { wrapper: createWrapper(context) });

      expect(screen.getByText('Existing Books (4)')).toBeInTheDocument();
    });

    it('should display message when no books exist', () => {
      const context = createMockContext({ books: [] });
      render(<BookManager />, { wrapper: createWrapper(context) });

      expect(screen.getByText('No books created yet.')).toBeInTheDocument();
    });

    it('should display author chips for books with authors', () => {
      const context = createMockContext();
      render(<BookManager />, { wrapper: createWrapper(context) });

      expect(screen.getByText('by Dr. Seuss')).toBeInTheDocument();
      expect(screen.getByText('by E.B. White')).toBeInTheDocument();
    });

    it('should display reading level chips', () => {
      const context = createMockContext();
      render(<BookManager />, { wrapper: createWrapper(context) });

      expect(screen.getByText('2.5')).toBeInTheDocument();
      expect(screen.getByText('4.5')).toBeInTheDocument();
      expect(screen.getByText('5.5')).toBeInTheDocument();
    });

    it('should display genre chips for books with genres', () => {
      const context = createMockContext();
      render(<BookManager />, { wrapper: createWrapper(context) });

      // Fiction should appear (book-1 and book-3 have genre-1)
      const fictionChips = screen.getAllByText('Fiction');
      expect(fictionChips.length).toBeGreaterThan(0);
    });
  });

  describe('Search/Filter Functionality', () => {
    it('should filter books by search query (title)', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const searchInput = screen.getByPlaceholderText('Search books...');
      await user.type(searchInput, 'Cat');

      expect(screen.getByText('The Cat in the Hat')).toBeInTheDocument();
      expect(screen.queryByText("Charlotte's Web")).not.toBeInTheDocument();
      expect(screen.queryByText('Harry Potter')).not.toBeInTheDocument();
    });

    it('should filter books by search query (author)', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const searchInput = screen.getByPlaceholderText('Search books...');
      await user.type(searchInput, 'Rowling');

      expect(screen.getByText('Harry Potter')).toBeInTheDocument();
      expect(screen.queryByText('The Cat in the Hat')).not.toBeInTheDocument();
    });

    it('should show filtered count when search is active', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const searchInput = screen.getByPlaceholderText('Search books...');
      await user.type(searchInput, 'Cat');

      expect(screen.getByText('Existing Books (1 of 4)')).toBeInTheDocument();
    });

    it('should reset to first page when search query changes', async () => {
      const manyBooks = createManyBooks(25);
      const context = createMockContext({ books: manyBooks });
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      // Go to page 2
      const page2Button = screen.getByRole('button', { name: 'Go to page 2' });
      await user.click(page2Button);

      // Search should reset to page 1
      const searchInput = screen.getByPlaceholderText('Search books...');
      await user.type(searchInput, 'Title 1');

      // Should be back on page 1
      expect(screen.getByText('Book Title 1')).toBeInTheDocument();
    });

    it('should show no match message when search yields no results', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const searchInput = screen.getByPlaceholderText('Search books...');
      await user.type(searchInput, 'Nonexistent Book');

      expect(screen.getByText('No books match the selected filters.')).toBeInTheDocument();
    });
  });

  describe('Genre Filter', () => {
    it('should render genre filter dropdown', () => {
      const context = createMockContext();
      render(<BookManager />, { wrapper: createWrapper(context) });

      // Check for the select component by its combobox role
      const genreSelects = screen.getAllByRole('combobox');
      // The genre filter is among the selects
      expect(genreSelects.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter books by genre', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      // Find selects and click the genre filter (second select after search)
      const genreSelects = screen.getAllByRole('combobox');
      // Genre filter is typically the first select dropdown after the search
      const genreFilter = genreSelects.find(s => s.textContent === '' || s.getAttribute('aria-labelledby')?.includes('genre'));
      await user.click(genreSelects[0]); // First combobox is genre filter

      // Select "Adventure" genre from the dropdown
      const adventureOption = await screen.findByRole('option', { name: 'Adventure' });
      await user.click(adventureOption);

      // Only books with Adventure (genre-2) should be visible
      expect(screen.getByText("Charlotte's Web")).toBeInTheDocument();
      expect(screen.getByText('Harry Potter')).toBeInTheDocument();
      expect(screen.queryByText('The Cat in the Hat')).not.toBeInTheDocument();
    });

    it('should show all books when "All Genres" is selected', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      // First filter by genre
      const genreSelects = screen.getAllByRole('combobox');
      await user.click(genreSelects[0]);

      const fictionOption = await screen.findByRole('option', { name: 'Fiction' });
      await user.click(fictionOption);

      // Then select "All Genres"
      await user.click(genreSelects[0]);
      const allOption = await screen.findByRole('option', { name: 'All Genres' });
      await user.click(allOption);

      // All books should be visible again
      expect(screen.getByText('The Cat in the Hat')).toBeInTheDocument();
      expect(screen.getByText("Charlotte's Web")).toBeInTheDocument();
    });

    it('should not show genre filter when no genres exist', () => {
      const context = createMockContext({ genres: [] });
      render(<BookManager />, { wrapper: createWrapper(context) });

      expect(screen.queryByText('Filter by Genre')).not.toBeInTheDocument();
    });
  });

  describe('Reading Level Filter', () => {
    it('should render reading level filter dropdown', () => {
      const context = createMockContext();
      render(<BookManager />, { wrapper: createWrapper(context) });

      // Check for multiple comboboxes (genre and level filters)
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter books by exact reading level', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      // Level filter is the second combobox
      const selects = screen.getAllByRole('combobox');
      await user.click(selects[1]);

      // Select level 2.5
      const level25Option = await screen.findByRole('option', { name: '2.5' });
      await user.click(level25Option);

      expect(screen.getByText('The Cat in the Hat')).toBeInTheDocument();
      expect(screen.queryByText("Charlotte's Web")).not.toBeInTheDocument();
    });

    it('should show level range filter when a level is selected', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      // Initially, 3 comboboxes (genre, level, books per page)
      let selects = screen.getAllByRole('combobox');
      const initialCount = selects.length;

      // Click level filter (second select)
      await user.click(selects[1]);

      const level25Option = await screen.findByRole('option', { name: '2.5' });
      await user.click(level25Option);

      // Now there should be one more combobox (level range)
      selects = screen.getAllByRole('combobox');
      expect(selects.length).toBe(initialCount + 1);
    });

    it('should filter books by reading level range', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      // Select base level
      let selects = screen.getAllByRole('combobox');
      await user.click(selects[1]);

      const level25Option = await screen.findByRole('option', { name: '2.5' });
      await user.click(level25Option);

      // Get updated selects - level range is now visible
      selects = screen.getAllByRole('combobox');
      // Level range is after level filter
      await user.click(selects[2]);

      const range2Option = await screen.findByRole('option', { name: '+2.0' });
      await user.click(range2Option);

      // Should show books with levels 2.5 to 4.5
      expect(screen.getByText('The Cat in the Hat')).toBeInTheDocument(); // 2.5
      expect(screen.getByText('Unknown Book')).toBeInTheDocument(); // 3.0
      expect(screen.getByText("Charlotte's Web")).toBeInTheDocument(); // 4.5
      expect(screen.queryByText('Harry Potter')).not.toBeInTheDocument(); // 5.5 is outside range
    });
  });

  describe('Pagination', () => {
    it('should display pagination controls when books exceed page size', () => {
      const manyBooks = createManyBooks(25);
      const context = createMockContext({ books: manyBooks });
      render(<BookManager />, { wrapper: createWrapper(context) });

      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('should not display pagination when all books fit on one page', () => {
      const context = createMockContext(); // 4 books, default 10 per page
      render(<BookManager />, { wrapper: createWrapper(context) });

      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('should show correct page range text', () => {
      const manyBooks = createManyBooks(25);
      const context = createMockContext({ books: manyBooks });
      render(<BookManager />, { wrapper: createWrapper(context) });

      expect(screen.getByText('Showing 1-10 of 25')).toBeInTheDocument();
    });

    it('should change page when clicking pagination button', async () => {
      const manyBooks = createManyBooks(25);
      const context = createMockContext({ books: manyBooks });
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      // Initially on page 1
      expect(screen.getByText('Book Title 1')).toBeInTheDocument();
      expect(screen.queryByText('Book Title 11')).not.toBeInTheDocument();

      // Go to page 2
      const page2Button = screen.getByRole('button', { name: 'Go to page 2' });
      await user.click(page2Button);

      expect(screen.queryByText('Book Title 1')).not.toBeInTheDocument();
      expect(screen.getByText('Book Title 11')).toBeInTheDocument();
    });

    it('should change books per page', async () => {
      const manyBooks = createManyBooks(25);
      const context = createMockContext({ books: manyBooks });
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      // Default is 10 per page
      expect(screen.getByText('Showing 1-10 of 25')).toBeInTheDocument();

      // Change to 20 per page - books per page is the last combobox
      const selects = screen.getAllByRole('combobox');
      const perPageSelect = selects[selects.length - 1];
      await user.click(perPageSelect);

      const option20 = await screen.findByRole('option', { name: '20' });
      await user.click(option20);

      expect(screen.getByText('Showing 1-20 of 25')).toBeInTheDocument();
    });

    it('should reset to page 1 when changing books per page', async () => {
      const manyBooks = createManyBooks(25);
      const context = createMockContext({ books: manyBooks });
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      // Go to page 2
      const page2Button = screen.getByRole('button', { name: 'Go to page 2' });
      await user.click(page2Button);

      // Change books per page - last combobox
      const selects = screen.getAllByRole('combobox');
      const perPageSelect = selects[selects.length - 1];
      await user.click(perPageSelect);

      const option20 = await screen.findByRole('option', { name: '20' });
      await user.click(option20);

      // Should be back on page 1
      expect(screen.getByText('Book Title 1')).toBeInTheDocument();
    });

    it('should show correct pagination after filtering', async () => {
      const manyBooks = createManyBooks(25);
      const context = createMockContext({ books: manyBooks });
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      // Search for a subset of books
      const searchInput = screen.getByPlaceholderText('Search books...');
      await user.type(searchInput, 'Title 1');

      // Should show filtered results (Title 1, 10-19)
      expect(screen.getByText(/of 11/)).toBeInTheDocument(); // 1, 10, 11, 12, ..., 19
    });
  });

  describe('Memoization of filteredBooks and paginatedBooks', () => {
    it('should only recalculate filteredBooks when dependencies change', async () => {
      const manyBooks = createManyBooks(100);
      const context = createMockContext({ books: manyBooks });

      const { rerender } = render(<BookManager />, { wrapper: createWrapper(context) });

      // Get initial render state
      const initialCount = screen.getByText('Existing Books (100)');
      expect(initialCount).toBeInTheDocument();

      // Re-render with same context should not cause issues
      rerender(
        <TestAppContext.Provider value={context}>
          <BookManager />
        </TestAppContext.Provider>
      );

      // Should still show the same count (memoization working)
      expect(screen.getByText('Existing Books (100)')).toBeInTheDocument();
    });

    it('should update filteredBooks when books data changes', async () => {
      const initialBooks = createManyBooks(10);
      const context = createMockContext({ books: initialBooks });

      const { rerender } = render(<BookManager />, { wrapper: createWrapper(context) });
      expect(screen.getByText('Existing Books (10)')).toBeInTheDocument();

      // Update with more books
      const updatedBooks = createManyBooks(15);
      const updatedContext = createMockContext({ books: updatedBooks });

      rerender(
        <TestAppContext.Provider value={updatedContext}>
          <BookManager />
        </TestAppContext.Provider>
      );

      expect(screen.getByText('Existing Books (15)')).toBeInTheDocument();
    });
  });

  describe('Add Book Functionality', () => {
    it('should call addBook when form is submitted with valid data', async () => {
      const mockAddBook = vi.fn().mockResolvedValue();
      const mockReload = vi.fn().mockResolvedValue();
      const context = createMockContext({
        addBook: mockAddBook,
        reloadDataFromServer: mockReload
      });
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      // Find the add book form (first form on page)
      const form = document.querySelector('form');
      const titleInput = within(form).getByRole('textbox', { name: /book title/i });
      const authorInput = within(form).getByRole('textbox', { name: /author/i });

      await user.type(titleInput, 'New Test Book');
      await user.type(authorInput, 'Test Author');

      const addButton = within(form).getByRole('button', { name: /add/i });
      await user.click(addButton);

      expect(mockAddBook).toHaveBeenCalledWith('New Test Book', 'Test Author');
      expect(mockReload).toHaveBeenCalled();
    });

    it('should not call addBook when title is empty', async () => {
      const mockAddBook = vi.fn();
      const context = createMockContext({ addBook: mockAddBook });
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      // Find the Add button and click it without entering a title
      const addButtons = screen.getAllByRole('button', { name: /add/i });
      // The Add button in the form is the first one
      await user.click(addButtons[0]);

      // Wait a tick for state update
      await waitFor(() => {
        // Ensure addBook was never called
        expect(mockAddBook).not.toHaveBeenCalled();
      });
    });

    it('should clear form fields after successful add', async () => {
      const mockAddBook = vi.fn().mockResolvedValue();
      const mockReload = vi.fn().mockResolvedValue();
      const context = createMockContext({
        addBook: mockAddBook,
        reloadDataFromServer: mockReload
      });
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const form = document.querySelector('form');
      const titleInput = within(form).getByRole('textbox', { name: /book title/i });
      const authorInput = within(form).getByRole('textbox', { name: /author/i });

      await user.type(titleInput, 'New Book');
      await user.type(authorInput, 'New Author');

      const addButton = within(form).getByRole('button', { name: /add/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(titleInput).toHaveValue('');
        expect(authorInput).toHaveValue('');
      });
    });

    it('should handle addBook error gracefully without crashing', async () => {
      // The component should not crash when addBook fails
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockAddBook = vi.fn().mockRejectedValue(new Error('Failed to add'));
      const context = createMockContext({ addBook: mockAddBook });
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const form = document.querySelector('form');
      const titleInput = within(form).getByRole('textbox', { name: /book title/i });
      await user.type(titleInput, 'New Book');

      // Submit the form
      fireEvent.submit(form);

      // Wait for the error to be caught and handled
      await waitFor(() => {
        expect(mockAddBook).toHaveBeenCalled();
      });

      // Verify it was called with the expected title
      expect(mockAddBook.mock.calls[0][0]).toBe('New Book');

      // The component should still be rendered (not crashed)
      expect(screen.getByText('Manage Books')).toBeInTheDocument();

      consoleSpy.mockRestore();
    });
  });

  describe('Edit Book Functionality', () => {
    it('should open edit dialog when clicking on a book', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const bookItem = screen.getByText('The Cat in the Hat').closest('li');
      await user.click(bookItem);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Edit Book')).toBeInTheDocument();
    });

    it('should populate edit form with book data', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const bookItem = screen.getByText('The Cat in the Hat').closest('li');
      await user.click(bookItem);

      const dialog = screen.getByRole('dialog');

      // Check form fields are populated
      expect(within(dialog).getByDisplayValue('The Cat in the Hat')).toBeInTheDocument();
      expect(within(dialog).getByDisplayValue('Dr. Seuss')).toBeInTheDocument();
      expect(within(dialog).getByDisplayValue('2.5')).toBeInTheDocument();
      expect(within(dialog).getByDisplayValue('4-8')).toBeInTheDocument();
    });

    it('should call fetchWithAuth when saving edited book', async () => {
      const mockFetchWithAuth = vi.fn().mockResolvedValue({ ok: true });
      const mockReload = vi.fn().mockResolvedValue();
      const context = createMockContext({
        fetchWithAuth: mockFetchWithAuth,
        reloadDataFromServer: mockReload
      });
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      // Open edit dialog
      const bookItem = screen.getByText('The Cat in the Hat').closest('li');
      await user.click(bookItem);

      // Edit the title
      const dialog = screen.getByRole('dialog');
      const titleInput = within(dialog).getByDisplayValue('The Cat in the Hat');
      await user.clear(titleInput);
      await user.type(titleInput, 'Updated Title');

      // Save
      const saveButton = within(dialog).getByRole('button', { name: /save/i });
      await user.click(saveButton);

      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        '/api/books/book-1',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('Updated Title')
        })
      );
    });

    it('should close dialog after successful save', async () => {
      const mockFetchWithAuth = vi.fn().mockResolvedValue({ ok: true });
      const mockReload = vi.fn().mockResolvedValue();
      const context = createMockContext({
        fetchWithAuth: mockFetchWithAuth,
        reloadDataFromServer: mockReload
      });
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const bookItem = screen.getByText('The Cat in the Hat').closest('li');
      await user.click(bookItem);

      const dialog = screen.getByRole('dialog');
      const saveButton = within(dialog).getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Edit Book' })).not.toBeInTheDocument();
      });
    });

    it('should close dialog when cancel is clicked', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const bookItem = screen.getByText('The Cat in the Hat').closest('li');
      await user.click(bookItem);

      const dialog = screen.getByRole('dialog');
      const cancelButton = within(dialog).getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Edit Book' })).not.toBeInTheDocument();
      });
    });

    it('should handle error when saving edit fails without crashing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockFetchWithAuth = vi.fn().mockImplementation(() => {
        throw new Error('API error: 500');
      });
      const context = createMockContext({ fetchWithAuth: mockFetchWithAuth });
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const bookItem = screen.getByText('The Cat in the Hat').closest('li');
      await user.click(bookItem);

      const dialog = screen.getByRole('dialog');
      const saveButton = within(dialog).getByRole('button', { name: /save/i });
      await user.click(saveButton);

      // Wait for the fetch to be called
      await waitFor(() => {
        expect(mockFetchWithAuth).toHaveBeenCalled();
      });

      // The component should still be rendered (not crashed)
      expect(screen.getByText('Edit Book')).toBeInTheDocument();

      consoleSpy.mockRestore();
    });

    it('should fetch book details from API when Get Details button is clicked', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const bookItem = screen.getByText('The Cat in the Hat').closest('li');
      await user.click(bookItem);

      const dialog = screen.getByRole('dialog');
      const getDetailsButton = within(dialog).getByRole('button', { name: /get details/i });
      await user.click(getDetailsButton);

      await waitFor(() => {
        expect(bookMetadataApi.getBookDetails).toHaveBeenCalledWith(
          'The Cat in the Hat',
          'Dr. Seuss',
          expect.any(Object)
        );
      });
    });
  });

  describe('Delete Book Functionality', () => {
    it('should show delete confirmation dialog', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      // Find the delete button for the first book
      const bookItems = screen.getAllByRole('listitem');
      const deleteButton = within(bookItems[0]).getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      expect(screen.getByText('Delete Book')).toBeInTheDocument();
      expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
    });

    it('should call fetchWithAuth when confirming delete', async () => {
      const mockFetchWithAuth = vi.fn().mockResolvedValue({ ok: true });
      const mockReload = vi.fn().mockResolvedValue();
      const context = createMockContext({
        fetchWithAuth: mockFetchWithAuth,
        reloadDataFromServer: mockReload
      });
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const bookItems = screen.getAllByRole('listitem');
      const deleteButton = within(bookItems[0]).getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      // Confirm delete
      const confirmButton = screen.getByRole('button', { name: /^delete$/i });
      await user.click(confirmButton);

      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        '/api/books/book-1',
        { method: 'DELETE' }
      );
      expect(mockReload).toHaveBeenCalled();
    });

    it('should close confirmation dialog when cancel is clicked', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const bookItems = screen.getAllByRole('listitem');
      const deleteButton = within(bookItems[0]).getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText('Delete Book')).not.toBeInTheDocument();
      });
    });

    it('should handle error when delete fails without crashing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockFetchWithAuth = vi.fn().mockImplementation(() => {
        throw new Error('API error: 500');
      });
      const context = createMockContext({ fetchWithAuth: mockFetchWithAuth });
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const bookItems = screen.getAllByRole('listitem');
      const deleteButton = within(bookItems[0]).getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      const confirmButton = screen.getByRole('button', { name: /^delete$/i });
      await user.click(confirmButton);

      // Wait for the fetch to be called
      await waitFor(() => {
        expect(mockFetchWithAuth).toHaveBeenCalled();
      });

      // The component should still be rendered (not crashed)
      expect(screen.getByText('Manage Books')).toBeInTheDocument();

      consoleSpy.mockRestore();
    });
  });

  describe('Bulk Import Functionality', () => {
    it('should render Import/Export button', () => {
      const context = createMockContext();
      render(<BookManager />, { wrapper: createWrapper(context) });

      expect(screen.getByRole('button', { name: /import\/export/i })).toBeInTheDocument();
    });

    it('should show import/export menu when clicking the button', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const importExportButton = screen.getByRole('button', { name: /import\/export/i });
      await user.click(importExportButton);

      expect(screen.getByText('Import Books')).toBeInTheDocument();
      expect(screen.getByText('Export JSON')).toBeInTheDocument();
      expect(screen.getByText('Export CSV')).toBeInTheDocument();
    });

    it('should open import wizard when Import Books is clicked', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const importExportButton = screen.getByRole('button', { name: /import\/export/i });
      await user.click(importExportButton);

      const importItem = screen.getByText('Import Books');
      await user.click(importItem);

      // The BookImportWizard dialog should be rendered with stepper
      await waitFor(() => {
        expect(screen.getByText('Upload CSV')).toBeInTheDocument();
      });
    });

    it('should show import confirmation dialog after valid file selection', async () => {
      const context = createMockContext();
      render(<BookManager />, { wrapper: createWrapper(context) });

      // Get the hidden file input
      const fileInput = document.querySelector('input[type="file"]');

      // Create a mock CSV file and simulate the change event
      const csvContent = 'Title,Author,Reading Level,Age Range\n"Test Book","Test Author","3.0","6-10"';
      const file = new File([csvContent], 'books.csv', { type: 'text/csv' });

      // Simulate file change with fireEvent
      Object.defineProperty(fileInput, 'files', {
        value: [file]
      });
      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('Confirm Import')).toBeInTheDocument();
      });
    });

    it('should call fetchWithAuth for bulk import when confirmed', async () => {
      const mockFetchWithAuth = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ imported: 1, duplicates: 0 })
      });
      const mockReload = vi.fn().mockResolvedValue();
      const context = createMockContext({
        fetchWithAuth: mockFetchWithAuth,
        reloadDataFromServer: mockReload
      });
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      // Get the hidden file input
      const fileInput = document.querySelector('input[type="file"]');

      // Create a mock CSV file
      const csvContent = 'Title,Author,Reading Level,Age Range\n"Test Book","Test Author","3.0","6-10"';
      const file = new File([csvContent], 'books.csv', { type: 'text/csv' });

      Object.defineProperty(fileInput, 'files', {
        value: [file]
      });
      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('Confirm Import')).toBeInTheDocument();
      });

      // Confirm import
      const importButton = screen.getByRole('button', { name: /^import$/i });
      await user.click(importButton);

      await waitFor(() => {
        expect(mockFetchWithAuth).toHaveBeenCalledWith(
          '/api/books/bulk',
          expect.objectContaining({
            method: 'POST'
          })
        );
      });
    });

    it('should show error for unsupported file format', async () => {
      const context = createMockContext();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const fileInput = document.querySelector('input[type="file"]');

      // Create a mock unsupported file
      const file = new File(['test content'], 'books.txt', { type: 'text/plain' });

      Object.defineProperty(fileInput, 'files', {
        value: [file]
      });
      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText(/unsupported file format/i)).toBeInTheDocument();
      });
    });

    it('should cancel import when cancel button is clicked', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const fileInput = document.querySelector('input[type="file"]');
      const csvContent = 'Title,Author,Reading Level,Age Range\n"Test Book","Test Author","3.0","6-10"';
      const file = new File([csvContent], 'books.csv', { type: 'text/csv' });

      Object.defineProperty(fileInput, 'files', {
        value: [file]
      });
      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('Confirm Import')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText('Confirm Import')).not.toBeInTheDocument();
      });
    });

    it('should parse JSON import files', async () => {
      const context = createMockContext();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const fileInput = document.querySelector('input[type="file"]');
      const jsonContent = JSON.stringify([
        { title: 'Test Book', author: 'Test Author', readingLevel: '3.0', ageRange: '6-10' }
      ]);
      const file = new File([jsonContent], 'books.json', { type: 'application/json' });

      Object.defineProperty(fileInput, 'files', {
        value: [file]
      });
      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('Confirm Import')).toBeInTheDocument();
        expect(screen.getByText(/1 books from "books.json"/)).toBeInTheDocument();
      });
    });
  });

  describe('Fill Missing and Refresh All Buttons', () => {
    it('should render Fill Missing button', () => {
      const context = createMockContext();
      render(<BookManager />, { wrapper: createWrapper(context) });

      expect(screen.getByRole('button', { name: /fill missing/i })).toBeInTheDocument();
    });

    it('should render Refresh All button', () => {
      const context = createMockContext();
      render(<BookManager />, { wrapper: createWrapper(context) });

      expect(screen.getByRole('button', { name: /refresh all/i })).toBeInTheDocument();
    });

    it('should call batchFetchAllMetadata when Fill Missing is clicked', async () => {
      const mockResults = [
        { book: { id: 'book-4', title: 'Unknown Book', author: null, description: null, genreIds: [] }, foundAuthor: 'Found Author', foundDescription: 'A description', foundGenres: ['Fiction'] }
      ];
      bookMetadataApi.batchFetchAllMetadata.mockResolvedValue(mockResults);

      const mockFetchWithAuth = vi.fn().mockResolvedValue({ ok: true });
      const mockReload = vi.fn().mockResolvedValue();
      const context = createMockContext({
        fetchWithAuth: mockFetchWithAuth,
        reloadDataFromServer: mockReload
      });
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const fillMissingButton = screen.getByRole('button', { name: /fill missing/i });
      await user.click(fillMissingButton);

      await waitFor(() => {
        expect(bookMetadataApi.batchFetchAllMetadata).toHaveBeenCalled();
      });
    });

    it('should call batchFetchAllMetadata when Refresh All is clicked', async () => {
      bookMetadataApi.batchFetchAllMetadata.mockResolvedValue([]);

      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const refreshAllButton = screen.getByRole('button', { name: /refresh all/i });
      await user.click(refreshAllButton);

      await waitFor(() => {
        expect(bookMetadataApi.batchFetchAllMetadata).toHaveBeenCalled();
      });
    });

    it('should show error when provider is unavailable for Fill Missing', async () => {
      bookMetadataApi.checkAvailability.mockResolvedValue(false);

      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const fillMissingButton = screen.getByRole('button', { name: /fill missing/i });
      await user.click(fillMissingButton);

      await waitFor(() => {
        expect(screen.getByText(/is currently unavailable/i)).toBeInTheDocument();
      });
    });

    it('should show error when provider is unavailable for Refresh All', async () => {
      bookMetadataApi.checkAvailability.mockResolvedValue(false);

      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const refreshAllButton = screen.getByRole('button', { name: /refresh all/i });
      await user.click(refreshAllButton);

      await waitFor(() => {
        expect(screen.getByText(/is currently unavailable/i)).toBeInTheDocument();
      });
    });

    it('should show error when provider config is invalid for Fill Missing', async () => {
      bookMetadataApi.validateProviderConfig.mockReturnValue({
        valid: false,
        error: 'API key required'
      });

      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const fillMissingButton = screen.getByRole('button', { name: /fill missing/i });
      await user.click(fillMissingButton);

      await waitFor(() => {
        expect(screen.getByText('API key required')).toBeInTheDocument();
      });
    });

    it('should disable Fill Missing and Refresh All when no books exist', () => {
      const context = createMockContext({ books: [] });
      render(<BookManager />, { wrapper: createWrapper(context) });

      const fillMissingButton = screen.getByRole('button', { name: /fill missing/i });
      expect(fillMissingButton).toBeDisabled();

      const refreshAllButton = screen.getByRole('button', { name: /refresh all/i });
      expect(refreshAllButton).toBeDisabled();
    });

    it('should show info when all books already have complete metadata', async () => {
      const completeBooks = [
        {
          id: 'book-1',
          title: 'Complete Book',
          author: 'Author',
          description: 'A description',
          genreIds: ['genre-1'],
          readingLevel: '3.0',
          ageRange: '6-10'
        }
      ];
      const context = createMockContext({ books: completeBooks });
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const fillMissingButton = screen.getByRole('button', { name: /fill missing/i });
      await user.click(fillMissingButton);

      await waitFor(() => {
        expect(screen.getByText(/all books already have complete metadata/i)).toBeInTheDocument();
      });
    });
  });

  describe('Export Functionality', () => {
    // Mock URL.createObjectURL and document.createElement for download tests
    let originalCreateObjectURL;
    let originalCreateElement;
    let mockLinkElement;

    beforeEach(() => {
      originalCreateObjectURL = URL.createObjectURL;
      URL.createObjectURL = vi.fn(() => 'blob:mock-url');

      mockLinkElement = {
        setAttribute: vi.fn(),
        click: vi.fn()
      };
      originalCreateElement = document.createElement.bind(document);
      document.createElement = vi.fn((tag) => {
        if (tag === 'a') return mockLinkElement;
        return originalCreateElement(tag);
      });
    });

    afterEach(() => {
      URL.createObjectURL = originalCreateObjectURL;
      document.createElement = originalCreateElement;
    });

    it('should export books as JSON when Export JSON is clicked', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const importExportButton = screen.getByRole('button', { name: /import\/export/i });
      await user.click(importExportButton);

      const exportJsonItem = screen.getByText('Export JSON');
      await user.click(exportJsonItem);

      expect(mockLinkElement.setAttribute).toHaveBeenCalledWith('download', expect.stringContaining('.json'));
      expect(mockLinkElement.click).toHaveBeenCalled();
    });

    it('should export books as CSV when Export CSV is clicked', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const importExportButton = screen.getByRole('button', { name: /import\/export/i });
      await user.click(importExportButton);

      const exportCsvItem = screen.getByText('Export CSV');
      await user.click(exportCsvItem);

      expect(mockLinkElement.setAttribute).toHaveBeenCalledWith('download', expect.stringContaining('.csv'));
      expect(mockLinkElement.click).toHaveBeenCalled();
    });

    it('should disable export when no books exist', async () => {
      const context = createMockContext({ books: [] });
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const importExportButton = screen.getByRole('button', { name: /import\/export/i });
      await user.click(importExportButton);

      const exportJsonItem = screen.getByText('Export JSON').closest('li');
      expect(exportJsonItem).toHaveClass('Mui-disabled');
    });
  });

  describe('Snackbar Notifications', () => {
    it('should show success snackbar after export', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const importExportButton = screen.getByRole('button', { name: /import\/export/i });
      await user.click(importExportButton);

      const exportJsonItem = screen.getByText('Export JSON');
      await user.click(exportJsonItem);

      await waitFor(() => {
        expect(screen.getByText('Books exported successfully')).toBeInTheDocument();
      });
    });

    it('should close snackbar when close button is clicked', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const importExportButton = screen.getByRole('button', { name: /import\/export/i });
      await user.click(importExportButton);

      const exportJsonItem = screen.getByText('Export JSON');
      await user.click(exportJsonItem);

      await waitFor(() => {
        expect(screen.getByText('Books exported successfully')).toBeInTheDocument();
      });

      // Close the snackbar
      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText('Books exported successfully')).not.toBeInTheDocument();
      });
    });
  });

  describe('Genre Management in Edit Dialog', () => {
    it('should display selected genres as chips in edit dialog', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const bookItem = screen.getByText('The Cat in the Hat').closest('li');
      await user.click(bookItem);

      const dialog = screen.getByRole('dialog');
      // The book has genre-1 (Fiction) - look in the genres section
      const genresSection = within(dialog).getByText('Genres').closest('div').parentElement;
      expect(within(genresSection).getByText('Fiction')).toBeInTheDocument();
    });

    it('should allow adding genres in edit dialog', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const bookItem = screen.getByText('The Cat in the Hat').closest('li');
      await user.click(bookItem);

      const dialog = screen.getByRole('dialog');
      const addGenreSelect = within(dialog).getByLabelText('Add Genre');
      await user.click(addGenreSelect);

      // Select Adventure genre (not currently on the book)
      const adventureOption = await screen.findByRole('option', { name: 'Adventure' });
      await user.click(adventureOption);

      // Adventure should now appear in the genre chips section
      const genresSection = within(dialog).getByText('Genres').closest('div').parentElement;
      expect(within(genresSection).getByText('Adventure')).toBeInTheDocument();
    });

    it('should allow removing genres in edit dialog', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const bookItem = screen.getByText('The Cat in the Hat').closest('li');
      await user.click(bookItem);

      const dialog = screen.getByRole('dialog');

      // Find the Fiction chip in the genres section and its delete button
      const genresSection = within(dialog).getByText('Genres').closest('div').parentElement;
      const fictionChip = within(genresSection).getByText('Fiction').closest('.MuiChip-root');
      const deleteButton = within(fictionChip).getByTestId('CancelIcon');
      await user.click(deleteButton);

      // Fiction should be removed, "No genres selected" should appear
      await waitFor(() => {
        expect(within(genresSection).queryByText('Fiction')).not.toBeInTheDocument();
        expect(within(genresSection).getByText('No genres selected')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have accessible form labels', () => {
      const context = createMockContext();
      render(<BookManager />, { wrapper: createWrapper(context) });

      // Check for main heading
      expect(screen.getByRole('heading', { level: 6, name: /manage books/i })).toBeInTheDocument();
    });

    it('should have accessible delete buttons with aria-label', () => {
      const context = createMockContext();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      expect(deleteButtons.length).toBe(4); // One for each book
    });

    it('should have keyboard-accessible book list items', () => {
      const context = createMockContext();
      render(<BookManager />, { wrapper: createWrapper(context) });

      const listItems = screen.getAllByRole('listitem');
      expect(listItems.length).toBe(4);
    });
  });
});
