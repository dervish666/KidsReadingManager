import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  CircularProgress,
  Alert,
  Paper,
  Stack,
  Tooltip
} from '@mui/material';
import { useAppContext } from '../contexts/AppContext';
import BookIcon from '@mui/icons-material/Book';
import SchoolIcon from '@mui/icons-material/School';
import PersonIcon from '@mui/icons-material/Person';
import RecommendationsIcon from '@mui/icons-material/Star';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import EditIcon from '@mui/icons-material/Edit';
import FavoriteIcon from '@mui/icons-material/Favorite';
import HistoryIcon from '@mui/icons-material/History';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import StudentProfile from './students/StudentProfile';
import BookCover from './BookCover';

const BookRecommendations = () => {
  const { students, classes, books, apiError, fetchWithAuth, globalClassFilter } = useAppContext();

  // State for selections and data
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [booksRead, setBooksRead] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [error, setError] = useState(null);
  const [aiConfig, setAiConfig] = useState(null);

  // New state for two-button UI
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [resultType, setResultType] = useState(null); // 'library' or 'ai'
  const [studentProfile, setStudentProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // State for preferences modal
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  // State for focus mode
  const [focusMode, setFocusMode] = useState('balanced');

  // Load AI config on mount
  useEffect(() => {
    const loadAIConfig = async () => {
      try {
        const response = await fetchWithAuth('/api/settings/ai');
        if (response.ok) {
          const config = await response.json();
          setAiConfig(config);
        }
      } catch (error) {
        // AI config loading failed silently - not critical
      }
    };

    if (fetchWithAuth) {
      loadAIConfig();
    }
  }, [fetchWithAuth]);

  // Helper to get provider display name
  const getProviderDisplayName = (provider) => {
    const names = {
      anthropic: 'Claude',
      openai: 'GPT',
      google: 'Gemini'
    };
    return names[provider] || provider;
  };

  // Filter students by global class filter
  const filteredStudents = students.filter(student => {
    if (!globalClassFilter || globalClassFilter === 'all') return true;
    if (globalClassFilter === 'unassigned') return !student.classId;
    return student.classId === globalClassFilter;
  });

  const selectedStudent = students.find(s => s.id === selectedStudentId);
  const selectedClass = selectedStudent ? classes.find(c => c.id === selectedStudent.classId) : null;

  // Helper function to resolve book title from bookId
  const getBookTitle = (bookId) => {
    if (!bookId || !books) return `Book ${bookId || 'Unknown'}`;

    // First try to find book by exact ID match
    const book = books.find(b => b.id === bookId);

    // If found, return title with author if available
    if (book) {
      const authorText = book.author ? ` by ${book.author}` : '';
      return book.title + authorText;
    }

    // Fallback to unknown book
    return `Book ${bookId}`;
  };

  const getStudentBookCount = (student) => {
    if (!student || !student.readingSessions) return 0;
    const uniqueBooks = new Set();
    student.readingSessions.forEach(session => {
      if (session.bookId) {
        uniqueBooks.add(session.bookId);
      }
    });
    return uniqueBooks.size;
  };

  const handleStudentChange = async (event) => {
    const studentId = event.target.value;
    setSelectedStudentId(studentId);

    const student = students.find(s => s.id === studentId);
    if (student && student.readingSessions) {
      // Extract unique books read by this student (store bookId, resolve title at render time)
      const uniqueBooks = new Map();
      student.readingSessions.forEach(session => {
        if (session.bookId) {
          uniqueBooks.set(session.bookId, {
            id: session.bookId,
            bookId: session.bookId,
            dateRead: session.date,
            assessment: session.assessment
          });
        }
      });
      setBooksRead(Array.from(uniqueBooks.values()));
    } else {
      setBooksRead([]);
    }
    setRecommendations([]);
    setStudentProfile(null);
    setResultType(null);
    setError(null);

    // Fetch the student profile for display
    if (studentId) {
      setProfileLoading(true);
      try {
        const response = await fetchWithAuth(`/api/books/library-search?studentId=${studentId}`);
        if (response.ok) {
          const data = await response.json();
          setStudentProfile(data.studentProfile);
        }
      } catch (err) {
        // Profile loading failed silently
      } finally {
        setProfileLoading(false);
      }
    }
  };

  // Handler for library search
  const handleLibrarySearch = async () => {
    if (!selectedStudentId) return;

    setLibraryLoading(true);
    setError(null);
    setRecommendations([]);
    setResultType('library');

    try {
      const response = await fetchWithAuth(`/api/books/library-search?studentId=${selectedStudentId}&focusMode=${focusMode}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
      }

      const data = await response.json();
      setStudentProfile(data.studentProfile);
      setRecommendations(data.books || []);

    } catch (err) {
      setError(err.message);
    } finally {
      setLibraryLoading(false);
    }
  };

  // Handler for AI suggestions
  const handleAiSuggestions = async () => {
    if (!selectedStudentId) return;

    setAiLoading(true);
    setError(null);
    setRecommendations([]);
    setResultType('ai');

    try {
      const response = await fetchWithAuth(`/api/books/ai-suggestions?studentId=${selectedStudentId}&focusMode=${focusMode}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
      }

      const data = await response.json();
      setStudentProfile(data.studentProfile);
      setRecommendations(data.suggestions || []);

    } catch (err) {
      setError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  // Determine AI status
  const hasActiveAI = aiConfig?.hasApiKey || aiConfig?.keySource === 'environment';
  const activeProvider = aiConfig?.provider;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4" component="h1" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <RecommendationsIcon color="primary" />
          Book Recommendations
        </Typography>

        {/* AI Status Indicator */}
        {aiConfig && (
          <Tooltip
            title={
              hasActiveAI
                ? `Using ${getProviderDisplayName(activeProvider)} for AI recommendations${aiConfig.modelPreference ? ` (${aiConfig.modelPreference})` : ''}`
                : 'No AI provider configured. Configure in Settings > AI Integration to enable AI suggestions.'
            }
          >
            <Chip
              icon={hasActiveAI ? <SmartToyIcon /> : <WarningIcon />}
              label={
                hasActiveAI
                  ? `AI: ${getProviderDisplayName(activeProvider)}`
                  : 'AI: Not configured'
              }
              color={hasActiveAI ? 'success' : 'warning'}
              variant="outlined"
              size="small"
            />
          </Tooltip>
        )}
      </Box>

      {apiError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {apiError}
        </Alert>
      )}

      {/* Student selection */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SchoolIcon />
          Select Student
        </Typography>

        <FormControl fullWidth sx={{ minWidth: 200 }}>
          <InputLabel id="student-select-label">Student</InputLabel>
          <Select
            labelId="student-select-label"
            id="student-select"
            value={selectedStudentId}
            onChange={handleStudentChange}
            label="Student"
            disabled={filteredStudents.length === 0}
            aria-describedby={filteredStudents.length === 0 ? "no-students-helper" : undefined}
          >
            <MenuItem value="">
              <em>Select a student</em>
            </MenuItem>
            {filteredStudents.map((student) => (
              <MenuItem key={student.id} value={student.id}>
                {student.name} ({getStudentBookCount(student)} books read)
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Paper>

      {/* Student info and profile - simple two-column layout */}
      {selectedStudent && (
        <Paper sx={{ p: 2, mb: 3 }}>
          {/* Header with student name and edit button */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PersonIcon color="primary" />
              <Typography variant="h6">{selectedStudent.name}</Typography>
              {selectedClass && (
                <Chip label={selectedClass.name} size="small" color="primary" />
              )}
              {(studentProfile?.readingLevelMin != null && studentProfile?.readingLevelMax != null) ? (
                <Chip label={`Level: ${studentProfile.readingLevelMin} - ${studentProfile.readingLevelMax}`} size="small" variant="outlined" />
              ) : studentProfile?.readingLevel && (
                <Chip label={`Level: ${studentProfile.readingLevel}`} size="small" variant="outlined" />
              )}
            </Box>
            <Button
              variant="outlined"
              size="small"
              startIcon={<EditIcon />}
              onClick={() => setPreferencesOpen(true)}
            >
              Edit Preferences
            </Button>
          </Box>

          {profileLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={20} />
            </Box>
          ) : (
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 2
            }}>
              {/* Left column: Books read */}
              <Box>
                <Typography variant="subtitle2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                  <BookIcon fontSize="small" />
                  Books Read ({booksRead.length})
                </Typography>
                {booksRead.length > 0 ? (
                  <Box sx={{ maxHeight: 150, overflow: 'auto', fontSize: '0.875rem' }}>
                    {booksRead.slice(0, 8).map((book, index) => (
                      <Box key={book.id} sx={{ py: 0.5, borderBottom: index < Math.min(booksRead.length, 8) - 1 ? '1px solid' : 'none', borderColor: 'divider' }}>
                        <Typography variant="body2" noWrap>{getBookTitle(book.bookId)}</Typography>
                        <Typography variant="caption" color="text.secondary">{new Date(book.dateRead).toLocaleDateString()}</Typography>
                      </Box>
                    ))}
                    {booksRead.length > 8 && (
                      <Typography variant="caption" color="text.secondary">... and {booksRead.length - 8} more</Typography>
                    )}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">No books recorded yet</Typography>
                )}
              </Box>

              {/* Right column: Profile details */}
              <Box>
                {/* Favorite Genres */}
                <Box sx={{ mb: 1.5 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <FavoriteIcon fontSize="small" color="error" />
                    Favorites
                  </Typography>
                  {studentProfile?.favoriteGenres?.length > 0 ? (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {studentProfile.favoriteGenres.map((genre, i) => (
                        <Chip key={i} label={genre} size="small" color="error" variant="outlined" />
                      ))}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary" fontStyle="italic">None set</Typography>
                  )}
                </Box>

                {/* Inferred from history */}
                {studentProfile?.inferredGenres?.length > 0 && (
                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <HistoryIcon fontSize="small" />
                      From History
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {studentProfile.inferredGenres.map((genre, i) => (
                        <Chip key={i} label={genre} size="small" variant="outlined" />
                      ))}
                    </Box>
                  </Box>
                )}

                {/* Likes */}
                {selectedStudent.preferences?.likes?.length > 0 && (
                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <ThumbUpIcon fontSize="small" color="success" />
                      Liked
                    </Typography>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {selectedStudent.preferences.likes.slice(0, 3).join(', ')}{selectedStudent.preferences.likes.length > 3 && ` +${selectedStudent.preferences.likes.length - 3} more`}
                    </Typography>
                  </Box>
                )}

                {/* Dislikes */}
                {selectedStudent.preferences?.dislikes?.length > 0 && (
                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <ThumbDownIcon fontSize="small" color="warning" />
                      Disliked
                    </Typography>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {selectedStudent.preferences.dislikes.slice(0, 3).join(', ')}{selectedStudent.preferences.dislikes.length > 3 && ` +${selectedStudent.preferences.dislikes.length - 3} more`}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          )}
        </Paper>
      )}

      {/* Two Buttons Area */}
      {selectedStudentId && (
        <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleLibrarySearch}
            disabled={!selectedStudentId || libraryLoading || aiLoading}
            startIcon={libraryLoading ? <CircularProgress size={20} color="inherit" /> : <BookIcon />}
          >
            {libraryLoading ? 'Searching...' : 'Find in Library'}
          </Button>

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="focus-mode-label">Focus</InputLabel>
            <Select
              labelId="focus-mode-label"
              id="focus-mode-select"
              value={focusMode}
              onChange={(e) => setFocusMode(e.target.value)}
              label="Focus"
              disabled={libraryLoading || aiLoading}
            >
              <MenuItem value="balanced">Balanced</MenuItem>
              <MenuItem value="consolidation">Consolidation</MenuItem>
              <MenuItem value="challenge">Challenge</MenuItem>
            </Select>
          </FormControl>

          <Tooltip
            title={!hasActiveAI ? 'Configure AI in Settings to enable' : ''}
            placement="top"
          >
            <span>
              <Button
                variant="outlined"
                color="secondary"
                onClick={handleAiSuggestions}
                disabled={!selectedStudentId || libraryLoading || aiLoading || !hasActiveAI}
                startIcon={aiLoading ? <CircularProgress size={20} color="inherit" /> : <SmartToyIcon />}
              >
                {aiLoading ? 'Generating...' : 'AI Suggestions'}
              </Button>
            </span>
          </Tooltip>
        </Box>
      )}

      {/* Error display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Results Header */}
      {recommendations.length > 0 && (
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {resultType === 'library' ? (
            <>
              <BookIcon /> Books from Your Library
            </>
          ) : (
            <>
              <SmartToyIcon /> AI Suggestions
            </>
          )}
          <Chip label={`${recommendations.length} results`} size="small" />
        </Typography>
      )}

      {/* Results Grid */}
      {recommendations.length > 0 && (
        <Grid container spacing={2}>
          {recommendations.map((book, index) => (
            <Grid item xs={12} md={6} key={book.id || index}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    {/* Cover on left */}
                    <BookCover title={book.title} author={book.author} width={80} height={120} />

                    {/* Content on right */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {/* Title with In Library chip for AI results */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Typography variant="h6" component="div" sx={{ wordBreak: 'break-word' }}>
                          {book.title}
                        </Typography>
                        {resultType === 'ai' && book.inLibrary && (
                          <Chip
                            icon={<CheckCircleIcon />}
                            label="In your library"
                            size="small"
                            color="success"
                            sx={{ ml: 1, flexShrink: 0 }}
                          />
                        )}
                      </Box>

                      {/* Author */}
                      <Typography color="text.secondary" gutterBottom>
                        by {book.author}
                      </Typography>

                      {/* Level chips */}
                      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                        <Chip label={book.readingLevel || book.level} size="small" variant="outlined" />
                        {book.ageRange && <Chip label={book.ageRange} size="small" variant="outlined" />}
                      </Stack>

                      {/* Genres for library results */}
                      {resultType === 'library' && book.genres && (
                        <Stack direction="row" spacing={0.5} sx={{ mb: 1, flexWrap: 'wrap', gap: 0.5 }}>
                          {book.genres.map((genre, i) => (
                            <Chip key={i} label={genre} size="small" color="primary" variant="outlined" />
                          ))}
                        </Stack>
                      )}

                      {/* Description for library results - truncated to 2 lines */}
                      {resultType === 'library' && book.description && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            mb: 1
                          }}
                        >
                          {book.description}
                        </Typography>
                      )}

                      {/* Match reason or AI reasoning */}
                      <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                        {resultType === 'library' ? book.matchReason : book.reason}
                      </Typography>

                      {/* Where to find for AI results */}
                      {resultType === 'ai' && book.whereToFind && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          {book.whereToFind}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* No recommendations yet */}
      {recommendations.length === 0 && selectedStudentId && !libraryLoading && !aiLoading && !error && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="body1" color="text.secondary">
            Click "Find in Library" to search your book collection, or "AI Suggestions" for personalized recommendations.
          </Typography>
        </Paper>
      )}

      {/* Reading Preferences Modal */}
      {selectedStudent && (
        <StudentProfile
          open={preferencesOpen}
          onClose={async () => {
            setPreferencesOpen(false);
            // Refresh student profile after closing preferences modal
            if (selectedStudentId) {
              setProfileLoading(true);
              try {
                const response = await fetchWithAuth(`/api/books/library-search?studentId=${selectedStudentId}`);
                if (response.ok) {
                  const data = await response.json();
                  setStudentProfile(data.studentProfile);
                }
              } catch (err) {
                // Profile refresh failed silently
              } finally {
                setProfileLoading(false);
              }
            }
          }}
          student={selectedStudent}
        />
      )}
    </Box>
  );
};

export default BookRecommendations;
