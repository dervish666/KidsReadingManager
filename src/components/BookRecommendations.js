import React, { useState } from 'react';
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
  Stack
} from '@mui/material';
import { useAppContext } from '../contexts/AppContext';
import BookIcon from '@mui/icons-material/Book';
import SchoolIcon from '@mui/icons-material/School';
import PersonIcon from '@mui/icons-material/Person';
import RecommendationsIcon from '@mui/icons-material/Star';

const BookRecommendations = () => {
  const { students, classes, books, apiError } = useAppContext();

  // State for selections and data
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [booksRead, setBooksRead] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filter students by selected class
  const filteredStudents = students.filter(student =>
    selectedClassId ? student.classId === selectedClassId : true
  );

  const selectedStudent = students.find(s => s.id === selectedStudentId);
  const selectedClass = classes.find(c => c.id === selectedClassId);

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

  const handleClassChange = (event) => {
    const classId = event.target.value;
    setSelectedClassId(classId);
    setSelectedStudentId(''); // Reset student selection
    setBooksRead([]);
    setRecommendations([]);
    setError(null);
  };

  const handleStudentChange = (event) => {
    const studentId = event.target.value;
    setSelectedStudentId(studentId);

    const student = students.find(s => s.id === studentId);
    if (student && student.readingSessions) {
      // Extract unique books read by this student
      const uniqueBooks = new Map();
      student.readingSessions.forEach(session => {
        if (session.bookId) {
          uniqueBooks.set(session.bookId, {
            id: session.bookId,
            title: getBookTitle(session.bookId),
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
    setError(null);
  };

  const fetchRecommendations = async () => {
    if (!selectedStudentId) {
      setError('Please select a student first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('Fetching AI-powered recommendations for studentId:', selectedStudentId);
      const response = await fetch(`/api/books/recommendations?studentId=${selectedStudentId}`);
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

        // Check if this is the new AI format (has 'genre', 'ageRange', 'reason') vs old database format (has 'id', 'genreIds')
        if (firstRecommendation.genre && firstRecommendation.ageRange && firstRecommendation.reason) {
          console.log('✅ AI recommendations successfully received!');
          setRecommendations(data.recommendations);
        } else if (firstRecommendation.id && firstRecommendation.genreIds) {
          console.log('⚠️  Received old database format. Server may need restart. Data:', firstRecommendation);
          // Still display what we got for now
          const formattedRecommendations = data.recommendations.map(book => ({
            title: book.title,
            author: book.author || 'Unknown',
            genre: 'Fiction',
            ageRange: '8-12',
            reason: `Classics book available in your library`
          }));
          setRecommendations(formattedRecommendations);
        } else {
          console.log('❌ Unknown recommendation format:', firstRecommendation);
          setRecommendations(data.recommendations);
        }
      } else {
        console.log('❌ No recommendations returned');
        setRecommendations([]);
      }
    } catch (err) {
      console.error('Error fetching recommendations:', err);
      setError(`Failed to fetch recommendations: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
        <RecommendationsIcon color="primary" />
        Book Recommendations
      </Typography>

      {apiError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {apiError}
        </Alert>
      )}

      {/* Class and Student selection */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SchoolIcon />
          Select Student
        </Typography>

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth sx={{ minWidth: '100%' }}>
              <InputLabel>Class (Optional)</InputLabel>
              <Select
                value={selectedClassId}
                onChange={handleClassChange}
                label="Class (Optional)"
                sx={{ minWidth: '100%' }}
              >
                <MenuItem value="">
                  <em>All Classes</em>
                </MenuItem>
                {classes.map((classItem) => (
                  <MenuItem key={classItem.id} value={classItem.id}>
                    {classItem.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={6}>
            <FormControl fullWidth sx={{ minWidth: '100%' }}>
              <InputLabel>Student</InputLabel>
              <Select
                value={selectedStudentId}
                onChange={handleStudentChange}
                label="Student"
                disabled={filteredStudents.length === 0}
                sx={{ minWidth: '100%' }}
              >
                <MenuItem value="">
                  <em>Select a student</em>
                </MenuItem>
                {filteredStudents.map((student) => (
                  <MenuItem key={student.id} value={student.id}>
                    {student.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
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
                              primary={book.title}
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
        <Box sx={{ mb: 4 }}>
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
        </Box>
      )}

      {/* Error display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Recommendations display */}
      {recommendations.length > 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" component="h2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RecommendationsIcon color="primary" />
            Recommended Books for {selectedStudent?.name}
          </Typography>

          <Grid container spacing={2}>
            {recommendations.map((book, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card elevation={2}>
                  <CardContent>
                    <Typography variant="h6" component="h3" gutterBottom>
                      {book.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {book.author && `by ${book.author}`}
                    </Typography>
                    {book.genre && (
                      <Chip label={book.genre} size="small" color="secondary" sx={{ mb: 1 }} />
                    )}
                    {book.level && (
                      <Chip label={`Level ${book.level}`} size="small" color="primary" />
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Paper>
      )}

      {/* No recommendations yet */}
      {recommendations.length === 0 && selectedStudentId && !loading && !error && (
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