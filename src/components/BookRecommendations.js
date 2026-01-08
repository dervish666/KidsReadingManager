import React, { useState, useCallback, useEffect } from 'react';
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
  CardMedia,
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
  Snackbar,
  IconButton,
  Tooltip
} from '@mui/material';
import { useAppContext } from '../contexts/AppContext';
import BookIcon from '@mui/icons-material/Book';
import SchoolIcon from '@mui/icons-material/School';
import PersonIcon from '@mui/icons-material/Person';
import RecommendationsIcon from '@mui/icons-material/Star';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import { getBookDetails, getCoverUrl, checkOpenLibraryAvailability, resetOpenLibraryAvailabilityCache } from '../utils/openLibraryApi';

const BookRecommendations = () => {
  const { students, classes, books, apiError, fetchWithAuth, globalClassFilter } = useAppContext();

  // State for selections and data
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [booksRead, setBooksRead] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [enhancedRecommendations, setEnhancedRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState(null);
  const [openLibraryStatus, setOpenLibraryStatus] = useState({ available: null, message: '' });
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState(null);

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

  const handleStudentChange = (event) => {
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
    setEnhancedRecommendations([]);
    setError(null);
    setOpenLibraryStatus({ available: null, message: '' });
  };

  // Background enhancement function that updates state progressively
  const enhanceRecommendationsInBackground = useCallback(async (basicRecommendations) => {
    if (!basicRecommendations || basicRecommendations.length === 0) {
      return;
    }

    // First, check if OpenLibrary is available with a quick timeout
    console.log('Checking OpenLibrary availability...');
    const isAvailable = await checkOpenLibraryAvailability(3000);
    
    if (!isAvailable) {
      console.log('OpenLibrary is not available, skipping enhancement');
      setOpenLibraryStatus({
        available: false,
        message: 'OpenLibrary is currently unavailable. Book covers and descriptions will not be loaded.'
      });
      setSnackbarOpen(true);
      setEnhancing(false);
      return;
    }

    setOpenLibraryStatus({ available: true, message: 'Enhancing with book covers...' });
    setEnhancing(true);

    // Enhance books one at a time and update state progressively
    for (let i = 0; i < basicRecommendations.length; i++) {
      const book = basicRecommendations[i];
      
      try {
        // Add a small delay to be respectful to the API
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        const bookDetails = await getBookDetails(book.title, book.author);
        
        // Update the enhanced recommendations progressively
        setEnhancedRecommendations(prev => {
          const updated = [...prev];
          updated[i] = {
            ...book,
            coverUrl: bookDetails ? getCoverUrl(bookDetails) : null,
            description: bookDetails ? bookDetails.description : null,
            olid: bookDetails ? bookDetails.olid : null,
            ia: bookDetails ? bookDetails.ia : null,
            enhanced: true
          };
          return updated;
        });
      } catch (error) {
        console.warn(`Failed to enhance book "${book.title}":`, error);
        // Mark as enhanced but without data
        setEnhancedRecommendations(prev => {
          const updated = [...prev];
          updated[i] = {
            ...book,
            coverUrl: null,
            description: null,
            olid: null,
            ia: null,
            enhanced: true,
            enhancementFailed: true
          };
          return updated;
        });
      }
    }

    setEnhancing(false);
    setOpenLibraryStatus({ available: true, message: '' });
  }, []);

  const handleRetryEnhancement = async () => {
    resetOpenLibraryAvailabilityCache();
    setOpenLibraryStatus({ available: null, message: 'Retrying OpenLibrary connection...' });
    
    // Reset enhanced recommendations to basic ones
    const basicRecs = enhancedRecommendations.map(rec => ({
      ...rec,
      coverUrl: null,
      description: null,
      olid: null,
      ia: null,
      enhanced: false,
      enhancementFailed: false
    }));
    setEnhancedRecommendations(basicRecs);
    
    // Try enhancement again
    await enhanceRecommendationsInBackground(basicRecs);
  };

  const fetchRecommendations = async () => {
    if (!selectedStudentId) {
      setError('Please select a student first');
      return;
    }

    setLoading(true);
    setError(null);
    setOpenLibraryStatus({ available: null, message: '' });

    try {
      console.log('Fetching AI-powered recommendations for studentId:', selectedStudentId);
      const response = await fetchWithAuth(`/api/books/recommendations?studentId=${selectedStudentId}`);
      console.log('Response status:', response.status);

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Full API response:', data);
      console.log('Recommendations data:', data.recommendations);

      // Check if we got the new AI format vs old database format
      if (data.recommendations && data.recommendations.length > 0) {
        const firstRecommendation = data.recommendations[0];
        console.log('First recommendation format check:', firstRecommendation);

        let processedRecommendations;

        // Check if this is the new AI format (has 'genre', 'ageRange', 'reason') vs old database format (has 'id', 'genreIds')
        if (firstRecommendation.genre && firstRecommendation.ageRange && firstRecommendation.reason) {
          console.log('✅ AI recommendations successfully received!');
          processedRecommendations = data.recommendations;
        } else if (firstRecommendation.id && firstRecommendation.genreIds) {
          console.log('⚠️  Received old database format. Server may need restart. Data:', firstRecommendation);
          // Still display what we got for now
          processedRecommendations = data.recommendations.map(book => ({
            title: book.title,
            author: book.author || 'Unknown',
            genre: 'Fiction',
            ageRange: '8-12',
            reason: `Classics book available in your library`
          }));
        } else {
          console.log('❌ Unknown recommendation format:', firstRecommendation);
          processedRecommendations = data.recommendations;
        }

        // Set recommendations immediately so user sees results right away
        setRecommendations(processedRecommendations);
        
        // Initialize enhanced recommendations with basic data (no covers yet)
        const initialEnhanced = processedRecommendations.map(book => ({
          ...book,
          coverUrl: null,
          description: null,
          olid: null,
          ia: null,
          enhanced: false
        }));
        setEnhancedRecommendations(initialEnhanced);
        
        // Stop the main loading indicator - user can see results now
        setLoading(false);

        // Enhance recommendations with OpenLibrary data in the background
        console.log('Starting background enhancement with OpenLibrary data...');
        enhanceRecommendationsInBackground(processedRecommendations);
      } else {
        console.log('❌ No recommendations returned');
        setRecommendations([]);
        setEnhancedRecommendations([]);
        setLoading(false);
      }
    } catch (err) {
      console.error('Error fetching recommendations:', err);
      setError(`Failed to fetch recommendations: ${err.message}`);
      setLoading(false);
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
                : 'No AI provider configured. Using fallback recommendations. Configure in Settings > AI Integration.'
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

      {/* Student info and books read */}
      {selectedStudent && (
        <Paper sx={{ p: 3, mb: 4 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonIcon />
            {selectedStudent.name}
            {selectedClass && (
              <Chip label={selectedClass.name} size="small" color="primary" />
            )}
          </Typography>

          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6"component="h3" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <BookIcon />
                    Books Read ({booksRead.length})
                  </Typography>
                  {booksRead.length > 0 ? (
                    <List sx={{ maxHeight: 200, overflow: 'auto' }}>
                      {booksRead.map((book, index) => (
                          <React.Fragment key={book.id}>
                            <ListItem>
                              <ListItemText
                                primary={getBookTitle(book.bookId)}
                              secondary={
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                                  <Typography variant="body2" color="text.secondary">
                                    {new Date(book.dateRead).toLocaleDateString()}
                                  </Typography>
                                  {book.assessment && (
                                    <Chip label={book.assessment} size="small" />
                                  )}
                                </Box>
                              }
                            />
                          </ListItem>
                          {index < booksRead.length - 1 && <Divider />}
                        </React.Fragment>
                      ))}
                    </List>
                  ) : (
                    <Typography color="text.secondary">
                      No books recorded for this student
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Reading Sessions
                  </Typography>
                  <Typography variant="h4" color="primary">
                    {selectedStudent.readingSessions?.length || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total sessions recorded
                  </Typography>
                  {selectedStudent.lastReadDate && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Last read: {new Date(selectedStudent.lastReadDate).toLocaleDateString()}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* Get Recommendations Button */}
      {selectedStudentId && (
        <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="contained"
            onClick={fetchRecommendations}
            disabled={loading}
            size="large"
            startIcon={loading ? <CircularProgress size={20} /> : <RecommendationsIcon />}
            sx={{ minWidth: 200 }}
          >
            {loading ? 'Getting Recommendations...' : 'Get Recommendations'}
          </Button>
          
          {enhancing && (
            <Chip
              icon={<CircularProgress size={16} />}
              label="Loading book covers..."
              color="info"
              variant="outlined"
            />
          )}
          
          {openLibraryStatus.available === false && !enhancing && enhancedRecommendations.length > 0 && (
            <Chip
              icon={<CloudOffIcon />}
              label="Covers unavailable"
              color="warning"
              variant="outlined"
              onDelete={handleRetryEnhancement}
              deleteIcon={<RefreshIcon />}
            />
          )}
        </Box>
      )}

      {/* OpenLibrary status snackbar */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        message={openLibraryStatus.message}
        action={
          <IconButton size="small" color="inherit" onClick={handleRetryEnhancement}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        }
      />

      {/* Error display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Recommendations display */}
      {enhancedRecommendations.length > 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" component="h2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RecommendationsIcon color="primary" />
            Recommended Books for {selectedStudent?.name}
          </Typography>

          <Grid container spacing={3}>
            {enhancedRecommendations.slice(0, 4).map((book, index) => (
              <Grid item xs={12} sm={6} key={index}>
                <Card elevation={2} sx={{ height: '100%', display: 'flex', flexDirection: 'row' }}>
                  {book.coverUrl && (
                    <Box
                      sx={{
                        flexShrink: 0,
                        width: 180,
                        minHeight: 180,
                        position: 'relative',
                        backgroundColor: 'grey.100'
                      }}
                    >
                      <CardMedia
                        component="img"
                        image={book.coverUrl}
                        alt={`Cover of ${book.title}`}
                        sx={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          position: 'absolute',
                          top: 0,
                          left: 0
                        }}
                        onError={(e) => {
                          e.target.parentElement.style.display = 'none';
                        }}
                      />
                    </Box>
                  )}
                  <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <Typography variant="h6" component="h3" gutterBottom sx={{ fontSize: '1.1rem' }}>
                      {book.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {book.author && `by ${book.author}`}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 0.5 }}>
                      {book.genre && (
                        <Chip label={book.genre} size="small" color="secondary" />
                      )}
                      {book.level && (
                        <Chip label={`Level ${book.level}`} size="small" color="primary" />
                      )}
                      {book.ageRange && (
                        <Chip label={book.ageRange} size="small" color="info" />
                      )}
                    </Stack>
                    {book.description && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          flexGrow: 1,
                          mb: 2,
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical'
                        }}
                      >
                        {book.description}
                      </Typography>
                    )}
                    {book.reason && (
                      <Typography variant="body2" color="primary" sx={{ fontStyle: 'italic' }}>
                        {book.reason}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Paper>
      )}

      {/* No recommendations yet */}
      {enhancedRecommendations.length === 0 && selectedStudentId && !loading && !enhancing && !error && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="body1" color="text.secondary">
            Click "Get Recommendations" to see personalized book suggestions for this student.
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default BookRecommendations;