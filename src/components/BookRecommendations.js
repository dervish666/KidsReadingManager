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
  List,
  ListItem,
  ListItemText,
  Divider,
  Paper,
  Stack,
  Tooltip,
  IconButton
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
import ReadingPreferences from './students/ReadingPreferences';

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
        console.error('Error loading AI config:', error);
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
        console.error('Error fetching student profile:', err);
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
      const response = await fetchWithAuth(`/api/books/library-search?studentId=${selectedStudentId}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
      }

      const data = await response.json();
      setStudentProfile(data.studentProfile);
      setRecommendations(data.books || []);

    } catch (err) {
      console.error('Library search error:', err);
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
      const response = await fetchWithAuth(`/api/books/ai-suggestions?studentId=${selectedStudentId}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
      }

      const data = await response.json();
      setStudentProfile(data.studentProfile);
      setRecommendations(data.suggestions || []);

    } catch (err) {
      console.error('AI suggestions error:', err);
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
          <InputLabel>Student</InputLabel>
          <Select
            value={selectedStudentId}
            onChange={handleStudentChange}
            label="Student"
            disabled={filteredStudents.length === 0}
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

      {/* Student info and profile details */}
      {selectedStudent && (
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {/* Left side: Books read */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PersonIcon />
                {selectedStudent.name}
                {selectedClass && (
                  <Chip label={selectedClass.name} size="small" color="primary" sx={{ ml: 1 }} />
                )}
              </Typography>

              <Card variant="outlined" sx={{ mt: 2 }}>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <BookIcon fontSize="small" />
                    Books Read ({booksRead.length})
                  </Typography>
                  {booksRead.length > 0 ? (
                    <List dense sx={{ maxHeight: 200, overflow: 'auto' }}>
                      {booksRead.slice(0, 10).map((book, index) => (
                        <React.Fragment key={book.id}>
                          <ListItem>
                            <ListItemText
                              primary={getBookTitle(book.bookId)}
                              secondary={new Date(book.dateRead).toLocaleDateString()}
                            />
                          </ListItem>
                          {index < Math.min(booksRead.length, 10) - 1 && <Divider />}
                        </React.Fragment>
                      ))}
                      {booksRead.length > 10 && (
                        <ListItem>
                          <ListItemText
                            secondary={`... and ${booksRead.length - 10} more`}
                          />
                        </ListItem>
                      )}
                    </List>
                  ) : (
                    <Typography color="text.secondary" variant="body2">
                      No books recorded yet
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Paper>
          </Grid>

          {/* Right side: Profile details for recommendations */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, height: '100%', bgcolor: 'primary.50' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SmartToyIcon color="primary" />
                  Recommendation Profile
                </Typography>
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
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : studentProfile ? (
                <Stack spacing={2}>
                  {/* Reading Level */}
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Reading Level
                    </Typography>
                    <Chip
                      label={studentProfile.readingLevel || 'Not set'}
                      color={studentProfile.readingLevel ? 'primary' : 'default'}
                      variant={studentProfile.readingLevel ? 'filled' : 'outlined'}
                    />
                  </Box>

                  {/* Favorite Genres */}
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <FavoriteIcon fontSize="small" color="error" />
                      Favorite Genres
                    </Typography>
                    {studentProfile.favoriteGenres?.length > 0 ? (
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {studentProfile.favoriteGenres.map((genre, i) => (
                          <Chip key={i} label={genre} size="small" color="error" variant="outlined" />
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary" fontStyle="italic">
                        None set - click Edit Preferences to add
                      </Typography>
                    )}
                  </Box>

                  {/* Inferred Genres from History */}
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <HistoryIcon fontSize="small" />
                      From Reading History
                    </Typography>
                    {studentProfile.inferredGenres?.length > 0 ? (
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {studentProfile.inferredGenres.map((genre, i) => (
                          <Chip key={i} label={genre} size="small" variant="outlined" />
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary" fontStyle="italic">
                        No reading history yet
                      </Typography>
                    )}
                  </Box>

                  {/* Likes */}
                  {selectedStudent.preferences?.likes?.length > 0 && (
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <ThumbUpIcon fontSize="small" color="success" />
                        Books They Liked
                      </Typography>
                      <Typography variant="body2">
                        {selectedStudent.preferences.likes.join(', ')}
                      </Typography>
                    </Box>
                  )}

                  {/* Dislikes */}
                  {selectedStudent.preferences?.dislikes?.length > 0 && (
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <ThumbDownIcon fontSize="small" color="warning" />
                        Books They Disliked
                      </Typography>
                      <Typography variant="body2">
                        {selectedStudent.preferences.dislikes.join(', ')}
                      </Typography>
                    </Box>
                  )}

                  {/* Recent Reads */}
                  {studentProfile.recentReads?.length > 0 && (
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        Recent Reads
                      </Typography>
                      <Typography variant="body2">
                        {studentProfile.recentReads.slice(0, 5).join(', ')}
                      </Typography>
                    </Box>
                  )}

                  {/* Books Read Count */}
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Total Books Read
                    </Typography>
                    <Typography variant="h5" color="primary">
                      {studentProfile.booksRead || booksRead.length}
                    </Typography>
                  </Box>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Select a student to see their recommendation profile
                </Typography>
              )}
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Two Buttons Area */}
      {selectedStudentId && (
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleLibrarySearch}
            disabled={!selectedStudentId || libraryLoading || aiLoading}
            startIcon={libraryLoading ? <CircularProgress size={20} color="inherit" /> : <BookIcon />}
          >
            {libraryLoading ? 'Searching...' : 'Find in Library'}
          </Button>

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
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Typography variant="h6" component="div">
                      {book.title}
                    </Typography>
                    {resultType === 'ai' && book.inLibrary && (
                      <Chip
                        icon={<CheckCircleIcon />}
                        label="In your library"
                        size="small"
                        color="success"
                      />
                    )}
                  </Box>
                  <Typography color="text.secondary" gutterBottom>
                    by {book.author}
                  </Typography>

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

                  {/* Match reason or AI reasoning */}
                  <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
                    {resultType === 'library' ? book.matchReason : book.reason}
                  </Typography>

                  {/* Where to find for AI results */}
                  {resultType === 'ai' && book.whereToFind && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      {book.whereToFind}
                    </Typography>
                  )}
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
        <ReadingPreferences
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
                console.error('Error refreshing student profile:', err);
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
