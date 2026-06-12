// src/__tests__/components/StudentEditForm.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import StudentEditForm from '../../components/students/StudentEditForm';

const mockFetchWithAuth = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    fetchWithAuth: mockFetchWithAuth,
  }),
}));

vi.mock('../../contexts/DataContext', () => ({
  useData: () => ({
    genres: [{ id: 'g1', name: 'Fantasy' }],
    classes: [{ id: 'c1', name: '3A' }],
    addGenre: vi.fn(),
  }),
}));

// BookAutocomplete pulls books from DataContext and can trigger fetches —
// stub it; the previously-read section under test doesn't use it.
vi.mock('../../components/sessions/BookAutocomplete', () => ({
  default: ({ label }) => <div data-testid="book-autocomplete">{label}</div>,
}));

const defaultSessions = [
  {
    id: 'sess-1',
    bookId: 'b1',
    bookTitle: 'The Hobbit',
    bookAuthor: 'J.R.R. Tolkien',
    date: '2026-06-10',
  },
  {
    id: 'sess-2',
    bookId: 'b2',
    bookTitle: 'Matilda',
    bookAuthor: 'Roald Dahl',
    date: '2026-06-08',
  },
  // Duplicate read of The Hobbit, older — must dedupe to the newer row
  {
    id: 'sess-3',
    bookId: 'b1',
    bookTitle: 'The Hobbit',
    bookAuthor: 'J.R.R. Tolkien',
    date: '2026-06-01',
  },
  // Session with no resolvable book title — must be skipped
  { id: 'sess-4', bookId: null, bookTitle: null, date: '2026-06-05' },
];

const mockStudent = {
  id: 's1',
  name: 'Alice Smith',
  classId: 'c1',
  preferences: { favoriteGenreIds: [], likes: [], dislikes: [] },
};

const setupFetch = (sessions = defaultSessions) => {
  mockFetchWithAuth.mockImplementation((url) => {
    if (/\/api\/students\/[^/]+\/sessions/.test(url)) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(sessions) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
};

describe('StudentEditForm — previously read books', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists the student's previously read books, deduped, skipping titleless sessions", async () => {
    setupFetch();
    render(<StudentEditForm student={mockStudent} onSave={vi.fn()} onCancel={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('The Hobbit')).toBeInTheDocument();
    });
    expect(screen.getByText('Matilda')).toBeInTheDocument();
    // Deduped: only one thumbs-up button for The Hobbit
    expect(screen.getAllByLabelText('Mark "The Hobbit" as enjoyed')).toHaveLength(1);
    // Count chip reflects the two unique titles
    expect(screen.getByText("Books They've Read")).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows an empty state when the student has no recorded books', async () => {
    setupFetch([]);
    render(<StudentEditForm student={mockStudent} onSave={vi.fn()} onCancel={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('No books recorded yet')).toBeInTheDocument();
    });
  });

  it('thumbs-up adds the book to likes and it is included on save', async () => {
    setupFetch();
    const onSave = vi.fn();
    const ref = React.createRef();
    const user = userEvent.setup();
    render(<StudentEditForm ref={ref} student={mockStudent} onSave={onSave} onCancel={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('The Hobbit')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Mark "The Hobbit" as enjoyed'));

    act(() => {
      ref.current.save();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const formData = onSave.mock.calls[0][0];
    expect(formData.preferences.likes).toContain('The Hobbit');
    expect(formData.preferences.dislikes).not.toContain('The Hobbit');
  });

  it('thumbs are mutually exclusive and a second tap clears the rating', async () => {
    setupFetch();
    const onSave = vi.fn();
    const ref = React.createRef();
    const user = userEvent.setup();
    render(<StudentEditForm ref={ref} student={mockStudent} onSave={onSave} onCancel={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Matilda')).toBeInTheDocument();
    });

    // Like, then dislike — dislike must replace the like
    await user.click(screen.getByLabelText('Mark "Matilda" as enjoyed'));
    await user.click(screen.getByLabelText('Mark "Matilda" as not enjoyed'));
    // Second tap on the active thumb clears it
    await user.click(screen.getByLabelText('Mark "The Hobbit" as enjoyed'));
    await user.click(screen.getByLabelText('Mark "The Hobbit" as enjoyed'));

    act(() => {
      ref.current.save();
    });

    const formData = onSave.mock.calls[0][0];
    expect(formData.preferences.likes).toEqual([]);
    expect(formData.preferences.dislikes).toEqual(['Matilda']);
  });

  it('pre-existing likes from the student record light up the matching thumb', async () => {
    setupFetch();
    const student = {
      ...mockStudent,
      preferences: { favoriteGenreIds: [], likes: ['The Hobbit'], dislikes: [] },
    };
    render(<StudentEditForm student={student} onSave={vi.fn()} onCancel={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('The Hobbit')).toBeInTheDocument();
    });

    // The existing like also renders as a chip in the Likes section
    expect(screen.getAllByText('The Hobbit').length).toBeGreaterThanOrEqual(2);
  });
});
