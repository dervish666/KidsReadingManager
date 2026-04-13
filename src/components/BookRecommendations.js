import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Tooltip,
  Collapse,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
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
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CloseIcon from '@mui/icons-material/Close';
import StudentEditForm from './students/StudentEditForm';
import BookCover from './BookCover';
import { STATUS_TO_PALETTE } from '../utils/helpers';
import { useTour } from './tour/useTour';
import TourButton from './tour/TourButton';

const BookIllustration = () => (
  <svg
    data-testid="empty-state-illustration"
    width="200"
    height="160"
    viewBox="0 0 200 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Open book */}
    <path d="M40 120 L100 105 L160 120 L160 50 L100 35 L40 50 Z" fill="#8AAD8A" opacity="0.15" />
    <path d="M40 120 L100 105 L100 35 L40 50 Z" fill="#6B8E6B" opacity="0.25" />
    <path d="M100 105 L160 120 L160 50 L100 35 Z" fill="#8AAD8A" opacity="0.2" />
    {/* Spine */}
    <line x1="100" y1="35" x2="100" y2="105" stroke="#557055" strokeWidth="2" opacity="0.4" />
    {/* Pages lines left */}
    <line x1="55" y1="58" x2="92" y2="48" stroke="#6B8E6B" strokeWidth="1.5" opacity="0.2" />
    <line x1="55" y1="68" x2="92" y2="58" stroke="#6B8E6B" strokeWidth="1.5" opacity="0.2" />
    <line x1="55" y1="78" x2="92" y2="68" stroke="#6B8E6B" strokeWidth="1.5" opacity="0.2" />
    <line x1="55" y1="88" x2="85" y2="80" stroke="#6B8E6B" strokeWidth="1.5" opacity="0.2" />
    {/* Pages lines right */}
    <line x1="108" y1="48" x2="148" y2="58" stroke="#8AAD8A" strokeWidth="1.5" opacity="0.2" />
    <line x1="108" y1="58" x2="148" y2="68" stroke="#8AAD8A" strokeWidth="1.5" opacity="0.2" />
    <line x1="108" y1="68" x2="148" y2="78" stroke="#8AAD8A" strokeWidth="1.5" opacity="0.2" />
    <line x1="108" y1="78" x2="140" y2="85" stroke="#8AAD8A" strokeWidth="1.5" opacity="0.2" />
    {/* Sparkles */}
    <circle cx="75" cy="28" r="3" fill="#D4A574" opacity="0.6" />
    <circle cx="130" cy="20" r="2" fill="#8B7355" opacity="0.4" />
    <circle cx="110" cy="15" r="2.5" fill="#D4A574" opacity="0.5" />
    <circle cx="85" cy="12" r="1.5" fill="#8AAD8A" opacity="0.5" />
    <circle cx="145" cy="30" r="2" fill="#6B8E6B" opacity="0.4" />
    {/* Star sparkles */}
    <path
      d="M60 22 L62 18 L64 22 L68 20 L64 24 L62 28 L60 24 L56 20 Z"
      fill="#D4A574"
      opacity="0.5"
    />
    <path
      d="M140 10 L141 7 L142 10 L145 9 L142 11 L141 14 L140 11 L137 9 Z"
      fill="#8B7355"
      opacity="0.4"
    />
  </svg>
);

const BookRecommendations = () => {
  const { fetchWithAuth, apiError } = useAuth();
  const { students, classes, books, updateStudent } = useData();
  const { globalClassFilter, prioritizedStudents, getReadingStatus, markStudentAsPriorityHandled } =
    useUI();

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const editFormRef = useRef(null);

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

  // State for preferences modal
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  // State for focus mode
  const [focusMode, setFocusMode] = useState('balanced');

  // State for cached result indicator
  const [isCachedResult, setIsCachedResult] = useState(false);

  // Tour — ready once library results are showing so all targets exist in DOM
  const { tourButtonProps } = useTour('recommendations', { ready: recommendations.length > 0 });

  // State for collapsible profile details
  const [showDetails, setShowDetails] = useState(false);

  // State for "Read it?" book ratings (maps book title to 'liked' | 'disliked')
  const [bookRatings, setBookRatings] = useState({});

  // Load AI config on mount
  useEffect(() => {
    const controller = new AbortController();
    const loadAIConfig = async () => {
      try {
        const response = await fetchWithAuth('/api/settings/ai', { signal: controller.signal });
        if (response.ok) {
          const config = await response.json();
          setAiConfig(config);
        }
      } catch (error) {
        if (error.name === 'AbortError') return;
        setAiConfig({ loadError: true });
      }
    };

    if (fetchWithAuth) {
      loadAIConfig();
    }
    return () => {
      controller.abort();
    };
  }, [fetchWithAuth]);

  // Helper to get provider display name
  const getProviderDisplayName = (provider) => {
    const names = {
      anthropic: 'Claude',
      openai: 'GPT',
      google: 'Gemini',
    };
    return names[provider] || provider;
  };

  // Filter students by global class filter
  const classFilter = (student) => {
    if (!globalClassFilter || globalClassFilter === 'all') return true;
    if (globalClassFilter === 'unassigned') return !student.classId;
    return student.classId === globalClassFilter;
  };
  const filteredStudents = students.filter(classFilter);

  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const selectedClass = selectedStudent
    ? classes.find((c) => c.id === selectedStudent.classId)
    : null;

  // Build a lookup Map for O(1) book lookups instead of O(n) find() per call
  const bookMap = useMemo(() => new Map((books || []).map((b) => [b.id, b])), [books]);

  // Helper function to resolve book title from bookId
  const getBookTitle = (bookId) => {
    if (!bookId || !books) return `Book ${bookId || 'Unknown'}`;

    const book = bookMap.get(bookId);

    if (book) {
      const authorText = book.author ? ` by ${book.author}` : '';
      return book.title + authorText;
    }

    return `Book ${bookId}`;
  };

  const getStudentBookCount = (student) => {
    return student?.totalSessionCount || 0;
  };

  // Helper to fetch sessions and build booksRead list for a student
  const loadStudentBooksRead = async (studentId, { signal } = {}) => {
    if (!studentId) {
      setBooksRead([]);
      return;
    }
    try {
      const response = await fetchWithAuth(`/api/students/${studentId}/sessions`, { signal });
      const sessions = response.ok ? await response.json() : [];
      const uniqueBooks = new Map();
      sessions.forEach((session) => {
        if (session.bookId) {
          uniqueBooks.set(session.bookId, {
            id: session.bookId,
            bookId: session.bookId,
            dateRead: session.date,
            assessment: session.assessment,
          });
        }
      });
      setBooksRead(Array.from(uniqueBooks.values()));
    } catch (error) {
      if (error.name === 'AbortError') return;
      setBooksRead([]);
    }
  };

  const handleStudentChange = async (event) => {
    const studentId = event.target.value;
    setSelectedStudentId(studentId);

    setRecommendations([]);
    setStudentProfile(null);
    setResultType(null);
    setError(null);
    setShowDetails(false);
    setBookRatings({});

    // Fetch sessions and library search in parallel
    if (studentId) {
      // Pre-populate ratings from student's existing likes/dislikes
      const student = students.find((s) => s.id === studentId);
      if (student) {
        const ratings = {};
        (student.likes || []).forEach((title) => {
          ratings[title] = 'liked';
        });
        (student.dislikes || []).forEach((title) => {
          ratings[title] = 'disliked';
        });
        setBookRatings(ratings);
      }
      await Promise.all([loadStudentBooksRead(studentId), triggerLibrarySearch(studentId)]);
    } else {
      setBooksRead([]);
    }
  };

  // Core library search function (reusable from multiple triggers)
  const triggerLibrarySearch = async (studentId, overrideFocusMode) => {
    if (!studentId) return;

    const effectiveFocus = overrideFocusMode || focusMode;
    setLibraryLoading(true);
    setError(null);
    setRecommendations([]);
    setResultType('library');
    setIsCachedResult(false);

    try {
      const response = await fetchWithAuth(
        `/api/books/library-search?studentId=${studentId}&focusMode=${effectiveFocus}`
      );

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

  // Handler for library search (wrapper for button, if needed)
  const handleLibrarySearch = async () => {
    await triggerLibrarySearch(selectedStudentId);
  };

  // Handler for quick-pick card click
  const handleQuickPick = async (studentId) => {
    setSelectedStudentId(studentId);
    setRecommendations([]);
    setStudentProfile(null);
    setResultType(null);
    setError(null);
    setShowDetails(false);

    // Pre-populate ratings from student's existing likes/dislikes
    const student = students.find((s) => s.id === studentId);
    if (student) {
      const ratings = {};
      (student.likes || []).forEach((title) => {
        ratings[title] = 'liked';
      });
      (student.dislikes || []).forEach((title) => {
        ratings[title] = 'disliked';
      });
      setBookRatings(ratings);
    } else {
      setBookRatings({});
    }

    if (markStudentAsPriorityHandled) {
      markStudentAsPriorityHandled(studentId);
    }

    await Promise.all([loadStudentBooksRead(studentId), triggerLibrarySearch(studentId)]);
  };

  // Handler for AI suggestions
  const handleAiSuggestions = async (skipCache = false, overrideFocusMode) => {
    if (!selectedStudentId) return;

    const effectiveFocus = overrideFocusMode || focusMode;
    setAiLoading(true);
    setError(null);
    setRecommendations([]);
    setResultType('ai');
    setIsCachedResult(false);

    try {
      let url = `/api/books/ai-suggestions?studentId=${selectedStudentId}&focusMode=${effectiveFocus}`;
      if (skipCache) {
        url += '&skipCache=true';
      }
      const response = await fetchWithAuth(url);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
      }

      const data = await response.json();
      setStudentProfile(data.studentProfile);
      setRecommendations(data.suggestions || []);
      setIsCachedResult(data.cached === true);
    } catch (err) {
      setError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  // Handler for refreshing AI suggestions (bypasses cache)
  const handleRefreshAiSuggestions = () => {
    handleAiSuggestions(true);
  };

  // Handler for "Read it?" thumbs up/down
  const handleBookRating = async (bookTitle, rating) => {
    if (!selectedStudentId || !bookTitle) return;

    const currentRating = bookRatings[bookTitle];
    const isToggleOff = currentRating === rating;

    // Compute new ratings map from current bookRatings (source of truth)
    const newRatings = { ...bookRatings };
    if (isToggleOff) {
      delete newRatings[bookTitle];
    } else {
      newRatings[bookTitle] = rating;
    }

    // Derive full likes/dislikes from the ratings map
    const newLikes = Object.entries(newRatings)
      .filter(([, r]) => r === 'liked')
      .map(([title]) => title);
    const newDislikes = Object.entries(newRatings)
      .filter(([, r]) => r === 'disliked')
      .map(([title]) => title);

    // Optimistic UI update
    setBookRatings(newRatings);

    try {
      const response = await fetchWithAuth(`/api/students/${selectedStudentId}/feedback`, {
        method: 'PUT',
        body: JSON.stringify({ likes: newLikes, dislikes: newDislikes }),
      });
      if (!response.ok) throw new Error('Failed to save');
    } catch {
      // Rollback optimistic UI
      setBookRatings(bookRatings);
    }
  };

  // Determine AI status
  const hasActiveAI =
    aiConfig?.keySource === 'organization' ||
    aiConfig?.keySource === 'platform' ||
    (aiConfig?.keySource === 'environment' && aiConfig?.aiAddonActive);
  const activeProvider = aiConfig?.provider;

  return (
    <Box sx={{ p: 3 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 4,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Typography
          variant="h4"
          component="h1"
          sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
        >
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
                hasActiveAI ? `AI: ${getProviderDisplayName(activeProvider)}` : 'AI: Not configured'
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

      {aiConfig?.loadError && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Could not load AI configuration. Library search is still available, but AI suggestions may
          not work.
        </Alert>
      )}

      {/* Student selection */}
      <Paper data-tour="recs-student-select" sx={{ p: 3, mb: 4 }}>
        <Typography
          variant="h6"
          gutterBottom
          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
        >
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
            aria-describedby={filteredStudents.length === 0 ? 'no-students-helper' : undefined}
          >
            <MenuItem value="">
              <em>Select a student</em>
            </MenuItem>
            {filteredStudents.map((student) => (
              <MenuItem key={student.id} value={student.id}>
                {student.name} ({getStudentBookCount(student)} sessions)
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Empty state with illustration and quick-picks */}
        {!selectedStudentId && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <BookIllustration />
            <Typography
              variant="h6"
              color="text.secondary"
              sx={{ mt: 2, fontFamily: '"Nunito", sans-serif', fontWeight: 600 }}
            >
              Select a student to find their next great read
            </Typography>

            {/* Priority student quick-pick cards */}
            {prioritizedStudents?.length > 0 && (
              <Box sx={{ mt: 4, textAlign: 'left' }}>
                <Typography
                  variant="subtitle1"
                  sx={{
                    mb: 2,
                    fontFamily: '"Nunito", sans-serif',
                    fontWeight: 700,
                    color: 'text.primary',
                  }}
                >
                  Priority Students
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: 'repeat(2, 1fr)',
                      sm: 'repeat(3, 1fr)',
                      md: 'repeat(4, 1fr)',
                    },
                    gap: 2,
                    ...(isMobile && {
                      display: 'flex',
                      overflowX: 'auto',
                      gap: 2,
                      pb: 1,
                      '& > *': { minWidth: 160, flexShrink: 0 },
                    }),
                  }}
                >
                  {prioritizedStudents
                    .filter(classFilter)
                    .slice(0, 6)
                    .map((student) => {
                      const status = getReadingStatus(student);
                      const statusColors = theme.palette.status || {
                        notRead: '#9E4B4B',
                        needsAttention: '#9B6E3A',
                        recentlyRead: '#4A6E4A',
                      };
                      const statusColor =
                        statusColors[STATUS_TO_PALETTE[status]] || statusColors.notRead;
                      const lastRead = student.lastReadDate
                        ? `Last read ${Math.ceil(Math.abs(new Date() - new Date(student.lastReadDate)) / (1000 * 60 * 60 * 24))} days ago`
                        : 'Never read';

                      return (
                        <Card
                          key={student.id}
                          onClick={() => handleQuickPick(student.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleQuickPick(student.id);
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          sx={{
                            cursor: 'pointer',
                            p: 2,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            '@media (hover: hover) and (pointer: fine)': {
                              '&:hover': {
                                transform: 'translateY(-4px)',
                                boxShadow:
                                  '0 8px 24px rgba(139, 115, 85, 0.15), 0 4px 8px rgba(0, 0, 0, 0.06)',
                              },
                            },
                          }}
                        >
                          <Box
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              bgcolor: statusColor,
                              flexShrink: 0,
                            }}
                          />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 700, fontFamily: '"Nunito", sans-serif' }}
                              noWrap
                            >
                              {student.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {lastRead}
                            </Typography>
                          </Box>
                        </Card>
                      );
                    })}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Paper>

      {/* Compact student profile bar */}
      {selectedStudent && (
        <Paper data-tour="recs-profile-bar" sx={{ p: 2, mb: 3 }}>
          {/* Compact bar */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              flexWrap: 'wrap',
            }}
          >
            <PersonIcon color="primary" />
            <Typography variant="h6" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}>
              {selectedStudent.name}
            </Typography>
            {selectedClass && <Chip label={selectedClass.name} size="small" color="primary" />}
            {studentProfile?.readingLevelMin != null && studentProfile?.readingLevelMax != null ? (
              <Chip
                label={`Level: ${studentProfile.readingLevelMin} - ${studentProfile.readingLevelMax}`}
                size="small"
                variant="outlined"
              />
            ) : (
              studentProfile?.readingLevel && (
                <Chip
                  label={`Level: ${studentProfile.readingLevel}`}
                  size="small"
                  variant="outlined"
                />
              )
            )}
            {studentProfile?.favoriteGenres?.map((genre, i) => (
              <Chip key={i} label={genre} size="small" color="error" variant="outlined" />
            ))}

            {/* Focus mode - moved here from button area */}
            <FormControl
              data-tour="recs-focus-mode"
              size="small"
              sx={{ minWidth: 130, ml: 'auto' }}
            >
              <InputLabel id="focus-mode-label">Focus</InputLabel>
              <Select
                labelId="focus-mode-label"
                id="focus-mode-select"
                value={focusMode}
                onChange={(e) => {
                  const newFocus = e.target.value;
                  setFocusMode(newFocus);
                  if (resultType === 'ai') {
                    handleAiSuggestions(false, newFocus);
                  } else {
                    triggerLibrarySearch(selectedStudentId, newFocus);
                  }
                }}
                label="Focus"
                disabled={libraryLoading || aiLoading}
              >
                <MenuItem value="balanced">Balanced</MenuItem>
                <MenuItem value="consolidation">Consolidation</MenuItem>
                <MenuItem value="challenge">Challenge</MenuItem>
              </Select>
            </FormControl>

            <IconButton
              size="small"
              onClick={() => setPreferencesOpen(true)}
              aria-label="Edit preferences"
              sx={{ color: 'primary.main' }}
            >
              <EditIcon />
            </IconButton>

            <IconButton
              size="small"
              onClick={() => setShowDetails(!showDetails)}
              aria-label={showDetails ? 'Hide reading history' : 'Show reading history'}
              sx={{ color: 'text.secondary' }}
            >
              {showDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>

          {/* Collapsible details */}
          <Collapse in={showDetails}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 2,
                mt: 2,
                pt: 2,
                borderTop: '1px solid',
                borderColor: 'divider',
              }}
            >
              {/* Left: Books read */}
              <Box>
                <Typography
                  variant="subtitle2"
                  color="text.secondary"
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}
                >
                  <BookIcon fontSize="small" />
                  Books Read ({booksRead.length})
                </Typography>
                {booksRead.length > 0 ? (
                  <Box sx={{ maxHeight: 150, overflow: 'auto', fontSize: '0.875rem' }}>
                    {booksRead.slice(0, 8).map((book, index) => (
                      <Box
                        key={book.id}
                        sx={{
                          py: 0.5,
                          borderBottom:
                            index < Math.min(booksRead.length, 8) - 1 ? '1px solid' : 'none',
                          borderColor: 'divider',
                        }}
                      >
                        <Typography variant="body2" noWrap>
                          {getBookTitle(book.bookId)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(book.dateRead).toLocaleDateString()}
                        </Typography>
                      </Box>
                    ))}
                    {booksRead.length > 8 && (
                      <Typography variant="caption" color="text.secondary">
                        ... and {booksRead.length - 8} more
                      </Typography>
                    )}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No books recorded yet
                  </Typography>
                )}
              </Box>

              {/* Right: Genres, likes, dislikes */}
              <Box>
                {/* Favorite Genres */}
                <Box sx={{ mb: 1.5 }}>
                  <Typography
                    variant="subtitle2"
                    color="text.secondary"
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}
                  >
                    <FavoriteIcon fontSize="small" color="error" />
                    Favorites
                  </Typography>
                  {studentProfile?.favoriteGenres?.length > 0 ? (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {studentProfile.favoriteGenres.map((genre, i) => (
                        <Chip
                          key={`fav-${i}`}
                          label={genre}
                          size="small"
                          color="error"
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary" fontStyle="italic">
                      None set
                    </Typography>
                  )}
                </Box>

                {/* Inferred from history */}
                {studentProfile?.inferredGenres?.length > 0 && (
                  <Box sx={{ mb: 1.5 }}>
                    <Typography
                      variant="subtitle2"
                      color="text.secondary"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}
                    >
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
                    <Typography
                      variant="subtitle2"
                      color="text.secondary"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}
                    >
                      <ThumbUpIcon fontSize="small" color="success" />
                      Liked
                    </Typography>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {selectedStudent.preferences.likes.slice(0, 3).join(', ')}
                      {selectedStudent.preferences.likes.length > 3 &&
                        ` +${selectedStudent.preferences.likes.length - 3} more`}
                    </Typography>
                  </Box>
                )}

                {/* Dislikes */}
                {selectedStudent.preferences?.dislikes?.length > 0 && (
                  <Box sx={{ mb: 1.5 }}>
                    <Typography
                      variant="subtitle2"
                      color="text.secondary"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}
                    >
                      <ThumbDownIcon fontSize="small" color="warning" />
                      Disliked
                    </Typography>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {selectedStudent.preferences.dislikes.slice(0, 3).join(', ')}
                      {selectedStudent.preferences.dislikes.length > 3 &&
                        ` +${selectedStudent.preferences.dislikes.length - 3} more`}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </Collapse>
        </Paper>
      )}

      {/* Error display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Loading skeleton */}
      {(libraryLoading || aiLoading) && (
        <Box
          data-testid="loading-skeleton"
          aria-live="polite"
          aria-busy={libraryLoading || aiLoading}
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 3 }}
        >
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} sx={{ p: 2, display: 'flex', gap: 2 }}>
              <Box
                sx={{
                  width: isMobile ? 100 : 120,
                  height: isMobile ? 150 : 180,
                  borderRadius: 1,
                  bgcolor: 'rgba(139, 115, 85, 0.08)',
                  animation: 'skeleton-pulse 1.5s ease-in-out infinite',
                  flexShrink: 0,
                }}
              />
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, py: 1 }}>
                <Box
                  sx={{
                    width: '70%',
                    height: 20,
                    borderRadius: 1,
                    bgcolor: 'rgba(139, 115, 85, 0.08)',
                    animation: 'skeleton-pulse 1.5s ease-in-out infinite',
                  }}
                />
                <Box
                  sx={{
                    width: '40%',
                    height: 16,
                    borderRadius: 1,
                    bgcolor: 'rgba(139, 115, 85, 0.06)',
                    animation: 'skeleton-pulse 1.5s ease-in-out 0.2s infinite',
                  }}
                />
                <Box
                  sx={{
                    width: '90%',
                    height: 14,
                    borderRadius: 1,
                    bgcolor: 'rgba(139, 115, 85, 0.05)',
                    animation: 'skeleton-pulse 1.5s ease-in-out 0.4s infinite',
                    mt: 'auto',
                  }}
                />
              </Box>
            </Card>
          ))}
        </Box>
      )}

      {/* Results Header */}
      {recommendations.length > 0 && (
        <Typography
          variant="h6"
          gutterBottom
          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
        >
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

      {/* Cached result indicator */}
      {isCachedResult && resultType === 'ai' && recommendations.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Chip label="Cached result" color="info" size="small" variant="outlined" />
          <Button size="small" onClick={handleRefreshAiSuggestions} disabled={aiLoading}>
            Get fresh suggestions
          </Button>
        </Box>
      )}

      {/* Results Grid */}
      {recommendations.length > 0 && (
        <Grid data-tour="recs-results" container spacing={3}>
          {recommendations.map((book, index) => (
            <Grid size={{ xs: 12, md: 6 }} key={book.id || index}>
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                  <Box sx={{ display: 'flex', gap: { xs: 2, md: 3 } }}>
                    {/* Cover with optional "In library" badge */}
                    <Box sx={{ position: 'relative', flexShrink: 0 }}>
                      <BookCover
                        title={book.title}
                        author={book.author}
                        width={isMobile ? 100 : 120}
                        height={isMobile ? 150 : 180}
                      />
                      {resultType === 'ai' && book.inLibrary && (
                        <Chip
                          icon={<CheckCircleIcon />}
                          label="In library"
                          size="small"
                          color="success"
                          sx={{
                            position: 'absolute',
                            top: 4,
                            right: -8,
                            fontSize: '0.7rem',
                            height: 22,
                          }}
                        />
                      )}
                    </Box>

                    {/* Content */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: 1,
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            variant="h6"
                            component="div"
                            sx={{
                              fontFamily: 'Nunito, sans-serif',
                              fontWeight: 700,
                              wordBreak: 'break-word',
                              lineHeight: 1.3,
                              mb: 0.5,
                            }}
                          >
                            {book.title}
                          </Typography>
                          <Typography sx={{ color: 'text.secondary', mb: 1.5 }}>
                            by {book.author}
                          </Typography>
                        </Box>

                        {/* Read it? thumbs */}
                        {selectedStudentId && (
                          <Box
                            sx={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'text.secondary',
                                fontSize: '0.65rem',
                                lineHeight: 1.2,
                                mb: 0.25,
                              }}
                            >
                              Read it?
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 0.25 }}>
                              <IconButton
                                size="small"
                                onClick={() => handleBookRating(book.title, 'liked')}
                                aria-label={`Mark "${book.title}" as liked`}
                                sx={{
                                  p: 0.5,
                                  color:
                                    bookRatings[book.title] === 'liked'
                                      ? 'success.main'
                                      : 'action.disabled',
                                  '&:hover': { color: 'success.main' },
                                }}
                              >
                                <ThumbUpIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() => handleBookRating(book.title, 'disliked')}
                                aria-label={`Mark "${book.title}" as disliked`}
                                sx={{
                                  p: 0.5,
                                  color:
                                    bookRatings[book.title] === 'disliked'
                                      ? 'error.main'
                                      : 'action.disabled',
                                  '&:hover': { color: 'error.main' },
                                }}
                              >
                                <ThumbDownIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Box>
                          </Box>
                        )}
                      </Box>

                      {/* Metadata chips */}
                      <Stack
                        direction="row"
                        spacing={0.5}
                        sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.5 }}
                      >
                        <Chip
                          label={book.readingLevel || book.level}
                          size="small"
                          variant="outlined"
                          sx={{ color: 'text.secondary', borderColor: 'divider' }}
                        />
                        {book.ageRange && (
                          <Chip
                            label={book.ageRange}
                            size="small"
                            variant="outlined"
                            sx={{ color: 'text.secondary', borderColor: 'divider' }}
                          />
                        )}
                        {resultType === 'library' &&
                          book.genres &&
                          book.genres.map((genre, i) => (
                            <Chip
                              key={i}
                              label={genre}
                              size="small"
                              variant="outlined"
                              sx={{ color: 'text.secondary', borderColor: 'divider' }}
                            />
                          ))}
                      </Stack>

                      {/* Description for library results */}
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
                            mb: 1.5,
                          }}
                        >
                          {book.description}
                        </Typography>
                      )}

                      {/* Match reason / AI reasoning - pull quote style */}
                      {(resultType === 'library' ? book.matchReason : book.reason) && (
                        <Box
                          sx={{
                            borderLeft: '3px solid',
                            borderColor: 'primary.light',
                            bgcolor: 'rgba(107, 142, 107, 0.06)',
                            pl: 1.5,
                            py: 0.75,
                            borderRadius: '0 4px 4px 0',
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{ fontStyle: 'italic', color: 'text.secondary' }}
                          >
                            {resultType === 'library' ? book.matchReason : book.reason}
                          </Typography>
                        </Box>
                      )}

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

      {/* AI suggestion banner - shown after library results */}
      {resultType === 'library' && !libraryLoading && selectedStudentId && hasActiveAI && (
        <Paper
          data-tour="recs-ai-banner"
          sx={{
            p: 2,
            mt: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
            bgcolor: 'rgba(107, 142, 107, 0.06)',
            border: '1px solid rgba(107, 142, 107, 0.15)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SmartToyIcon sx={{ color: 'primary.main' }} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Want personalised picks?
            </Typography>
            <Chip
              label={getProviderDisplayName(activeProvider)}
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.7rem' }}
            />
          </Box>
          <Button
            variant="contained"
            size="small"
            onClick={() => handleAiSuggestions()}
            disabled={aiLoading}
            startIcon={
              aiLoading ? <CircularProgress size={16} color="inherit" /> : <SmartToyIcon />
            }
          >
            {aiLoading ? 'Generating...' : 'Ask AI'}
          </Button>
        </Paper>
      )}

      {/* AI hint when not configured — also serves as tour target */}
      {resultType === 'library' && !libraryLoading && selectedStudentId && !hasActiveAI && (
        <Paper
          data-tour="recs-ai-banner"
          sx={{
            p: 2,
            mt: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            bgcolor: 'rgba(139, 115, 85, 0.04)',
            border: '1px solid rgba(139, 115, 85, 0.12)',
          }}
        >
          <SmartToyIcon sx={{ color: 'text.secondary' }} />
          <Typography variant="body2" color="text.secondary">
            AI recommendations require an API key. Your school admin can configure one in Settings,
            or contact Tally Reading to enable the AI add-on.
          </Typography>
        </Paper>
      )}

      {/* Reading Preferences Modal */}
      {selectedStudent && (
        <Dialog
          open={preferencesOpen}
          onClose={() => setPreferencesOpen(false)}
          fullWidth
          maxWidth="md"
          fullScreen={fullScreen}
        >
          <DialogTitle
            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Typography variant="h6" component="span">
              {selectedStudent?.name} — Reading Preferences
            </Typography>
            <IconButton onClick={() => setPreferencesOpen(false)}>
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            <StudentEditForm
              ref={editFormRef}
              student={selectedStudent}
              onSave={async (data) => {
                await updateStudent(selectedStudent.id, data);
                setPreferencesOpen(false);
                if (selectedStudentId) {
                  await triggerLibrarySearch(selectedStudentId);
                }
              }}
              onCancel={() => setPreferencesOpen(false)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPreferencesOpen(false)}>Cancel</Button>
            <Button onClick={() => editFormRef.current?.save()} variant="contained">
              Save
            </Button>
          </DialogActions>
        </Dialog>
      )}

      <TourButton {...tourButtonProps} />
    </Box>
  );
};

export default BookRecommendations;
