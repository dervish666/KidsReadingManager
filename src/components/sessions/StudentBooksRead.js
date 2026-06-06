import React from 'react';
import { Box, Typography, Paper, CircularProgress } from '@mui/material';
import BookCover from '../BookCover';

/**
 * "Books Read" panel for the selected student in the full reading register
 * view. Groups the student's reading history by book and renders a horizontal
 * strip of covers with session counts and last-read dates.
 *
 * @param {object} props
 * @param {object} props.selectedStudent - The selected student (must be non-null)
 * @param {boolean} props.loading - Whether the history fetch is in flight
 * @param {Array} props.sessions - Student reading sessions, sorted newest-first
 * @param {Map} props.booksMap - Book lookup by id
 */
const StudentBooksRead = ({ selectedStudent, loading, sessions, booksMap }) => {
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
        Books Read — {selectedStudent.name}
      </Typography>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={28} />
        </Box>
      ) : sessions.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
          No reading sessions recorded yet
        </Typography>
      ) : (
        (() => {
          // Group sessions by bookId, ordered by most recent session
          const bookGroups = new Map();
          for (const session of sessions) {
            const key = session.bookId || `no-book-${session.id}`;
            if (!bookGroups.has(key)) {
              bookGroups.set(key, { bookId: session.bookId, sessions: [] });
            }
            bookGroups.get(key).sessions.push(session);
          }
          const booksRead = [...bookGroups.values()]
            .filter((g) => g.bookId) // exclude sessions with no book
            .map((g) => ({
              ...g,
              lastDate: g.sessions[0].date, // already sorted newest-first
              firstDate: g.sessions[g.sessions.length - 1].date,
              count: g.sessions.length,
            }));
          if (booksRead.length === 0)
            return (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ textAlign: 'center', py: 2 }}
              >
                No books recorded yet
              </Typography>
            );
          return (
            <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
              {booksRead.slice(0, 30).map((entry) => {
                const book = booksMap.get(entry.bookId);
                const lastDate = new Date(entry.lastDate);
                const dateLabel = lastDate.toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                });
                return (
                  <Box
                    key={entry.bookId}
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      minWidth: 90,
                      maxWidth: 90,
                      flexShrink: 0,
                    }}
                  >
                    <BookCover
                      title={book?.title || 'Unknown'}
                      author={book?.author}
                      isbn={book?.isbn || null}
                      width={70}
                      height={100}
                    />
                    <Typography
                      variant="caption"
                      sx={{
                        mt: 0.5,
                        fontWeight: 600,
                        textAlign: 'center',
                        lineHeight: 1.2,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        fontSize: '0.7rem',
                        width: '100%',
                      }}
                    >
                      {book?.title || 'Unknown'}
                    </Typography>
                    {book?.author && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontSize: '0.6rem', textAlign: 'center', lineHeight: 1.1 }}
                        noWrap
                      >
                        {book.author}
                      </Typography>
                    )}
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontSize: '0.6rem' }}
                    >
                      {entry.count} {entry.count === 1 ? 'session' : 'sessions'}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontSize: '0.6rem' }}
                    >
                      {dateLabel}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          );
        })()
      )}
    </Paper>
  );
};

export default StudentBooksRead;
