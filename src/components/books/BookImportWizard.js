import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stepper,
  Step,
  StepLabel,
  Box,
  Typography,
  LinearProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  Checkbox,
  Chip,
  Divider,
  Paper
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useAppContext } from '../../contexts/AppContext';
import { parseCSV, detectColumnMapping, mapCSVToBooks } from '../../utils/csvParser';

const steps = ['Upload CSV', 'Map Columns', 'Review Matches', 'Confirm Import'];

const BookImportWizard = ({ open, onClose }) => {
  const { fetchWithAuth, reloadDataFromServer } = useAppContext();
  const [activeStep, setActiveStep] = useState(0);
  const [csvData, setCsvData] = useState(null);
  const [columnMapping, setColumnMapping] = useState({ title: null, author: null, readingLevel: null, isbn: null });
  const [previewResults, setPreviewResults] = useState(null);
  const [selectedConflicts, setSelectedConflicts] = useState({});
  const [selectedPossibleMatches, setSelectedPossibleMatches] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [importResult, setImportResult] = useState(null);

  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parseCSV(e.target.result);
        const autoMapping = detectColumnMapping(parsed.headers);
        setCsvData(parsed);
        setColumnMapping(autoMapping);
        setError(null);
        setActiveStep(1);
      } catch (err) {
        setError(`Failed to parse CSV: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleMappingChange = (field, value) => {
    setColumnMapping(prev => ({ ...prev, [field]: value === '' ? null : parseInt(value) }));
  };

  const handlePreview = async () => {
    if (columnMapping.title === null) {
      setError('Title column is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const books = mapCSVToBooks(csvData.rows, columnMapping);

      const response = await fetchWithAuth('/api/books/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books })
      });

      if (!response.ok) throw new Error('Preview failed');

      const results = await response.json();
      setPreviewResults(results);
      setActiveStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const payload = {
        matched: previewResults.matched.map(m => ({ existingBookId: m.existingBook.id })),
        newBooks: previewResults.newBooks.map(n => n.importedBook),
        conflicts: previewResults.conflicts
          .filter(c => selectedConflicts[c.existingBook.id])
          .map(c => ({
            existingBookId: c.existingBook.id,
            updateReadingLevel: true,
            newReadingLevel: c.importedBook.readingLevel
          }))
      };

      // Also link conflicts that weren't updated
      const unupdatedConflicts = previewResults.conflicts
        .filter(c => !selectedConflicts[c.existingBook.id])
        .map(c => ({ existingBookId: c.existingBook.id }));
      payload.matched.push(...unupdatedConflicts);

      // Handle possible matches: accepted ones link to existing, rejected become new books
      if (previewResults.possibleMatches) {
        const acceptedMatches = previewResults.possibleMatches
          .filter(pm => selectedPossibleMatches[pm.existingBook.id])
          .map(pm => ({ existingBookId: pm.existingBook.id }));
        payload.matched.push(...acceptedMatches);

        const rejectedMatches = previewResults.possibleMatches
          .filter(pm => !selectedPossibleMatches[pm.existingBook.id])
          .map(pm => pm.importedBook);
        payload.newBooks.push(...rejectedMatches);
      }

      const response = await fetchWithAuth('/api/books/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error('Import failed');

      const result = await response.json();
      setImportResult(result);
      setActiveStep(3);
      await reloadDataFromServer();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setActiveStep(0);
    setCsvData(null);
    setColumnMapping({ title: null, author: null, readingLevel: null, isbn: null });
    setPreviewResults(null);
    setSelectedConflicts({});
    setSelectedPossibleMatches({});
    setError(null);
    setImportResult(null);
    onClose();
  };

  const renderStepContent = () => {
    switch (activeStep) {
      case 0: // Upload
        return (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              id="csv-upload"
            />
            <label htmlFor="csv-upload">
              <Button
                variant="outlined"
                component="span"
                startIcon={<UploadFileIcon />}
                size="large"
              >
                Select CSV File
              </Button>
            </label>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Expected columns: Title, Author (optional), Reading Level (optional), ISBN (optional)
            </Typography>
          </Box>
        );

      case 1: // Column Mapping
        return (
          <Box sx={{ py: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Map your CSV columns to book fields:
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              {['title', 'author', 'readingLevel', 'isbn'].map((field) => {
                const fieldLabels = { title: 'Title', author: 'Author', readingLevel: 'Reading Level', isbn: 'ISBN' };
                const label = fieldLabels[field] || field;
                return (
                <FormControl key={field} fullWidth size="small">
                  <InputLabel>{label}</InputLabel>
                  <Select
                    value={columnMapping[field] ?? ''}
                    label={label}
                    onChange={(e) => handleMappingChange(field, e.target.value)}
                  >
                    <MenuItem value="">Not mapped</MenuItem>
                    {csvData?.headers.map((header, idx) => (
                      <MenuItem key={idx} value={idx}>{header}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ); })}
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Preview: {csvData?.rows.length} books found in CSV
            </Typography>
          </Box>
        );

      case 2: // Review
        return (
          <Box sx={{ py: 2 }}>
            {previewResults && (
              <>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                  <Chip label={`${previewResults.matched.length} matched`} color="success" />
                  <Chip label={`${previewResults.newBooks.length} new`} color="primary" />
                  {previewResults.possibleMatches?.length > 0 && (
                    <Chip label={`${previewResults.possibleMatches.length} possible matches`} color="info" />
                  )}
                  <Chip label={`${previewResults.conflicts.length} conflicts`} color="warning" />
                  <Chip label={`${previewResults.alreadyInLibrary.length} already in library`} color="default" />
                </Box>

                {previewResults.possibleMatches?.length > 0 && (
                  <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Possible Matches - Are these the same book?
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Check to link to existing book, uncheck to create new
                    </Typography>
                    <List dense>
                      {previewResults.possibleMatches.map((match) => (
                        <ListItem key={match.existingBook.id} dense sx={{ alignItems: 'flex-start' }}>
                          <Checkbox
                            checked={!!selectedPossibleMatches[match.existingBook.id]}
                            onChange={(e) => setSelectedPossibleMatches(prev => ({
                              ...prev,
                              [match.existingBook.id]: e.target.checked
                            }))}
                            sx={{ mt: 0.5 }}
                          />
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                <Typography variant="body2" component="span" sx={{ color: 'text.secondary' }}>
                                  "{match.importedBook.title}"
                                </Typography>
                                <Typography variant="body2" component="span">→</Typography>
                                <Typography variant="body2" component="span" sx={{ fontWeight: 500 }}>
                                  "{match.existingBook.title}"
                                </Typography>
                              </Box>
                            }
                            secondary={
                              <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
                                {match.importedBook.author && (
                                  <Typography variant="caption" component="span" sx={{ color: 'text.secondary', mr: 1 }}>
                                    by {match.importedBook.author}
                                  </Typography>
                                )}
                                {match.existingBook.author && match.importedBook.author !== match.existingBook.author && (
                                  <Typography variant="caption" component="span">
                                    → by {match.existingBook.author}
                                  </Typography>
                                )}
                              </Box>
                            }
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Paper>
                )}

                {previewResults.conflicts.length > 0 && (
                  <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Metadata Conflicts - Update these books?
                    </Typography>
                    <List dense>
                      {previewResults.conflicts.map((conflict) => (
                        <ListItem key={conflict.existingBook.id} dense>
                          <Checkbox
                            checked={!!selectedConflicts[conflict.existingBook.id]}
                            onChange={(e) => setSelectedConflicts(prev => ({
                              ...prev,
                              [conflict.existingBook.id]: e.target.checked
                            }))}
                          />
                          <ListItemText
                            primary={conflict.existingBook.title}
                            secondary={`Level: ${conflict.existingBook.reading_level} → ${conflict.importedBook.readingLevel}`}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Paper>
                )}
              </>
            )}
          </Box>
        );

      case 3: // Complete
        return (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="h6" color="success.main" gutterBottom>
              Import Complete!
            </Typography>
            {importResult && (
              <Box sx={{ mt: 2 }}>
                <Typography>Linked: {importResult.linked} books</Typography>
                <Typography>Created: {importResult.created} books</Typography>
                <Typography>Updated: {importResult.updated} books</Typography>
              </Box>
            )}
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Import Books</DialogTitle>
      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {isLoading && <LinearProgress sx={{ mb: 2 }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {renderStepContent()}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>
          {activeStep === 3 ? 'Done' : 'Cancel'}
        </Button>
        {activeStep === 1 && (
          <Button onClick={handlePreview} variant="contained" disabled={isLoading}>
            Preview Import
          </Button>
        )}
        {activeStep === 2 && (
          <Button onClick={handleConfirmImport} variant="contained" color="primary" disabled={isLoading}>
            Confirm Import
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default BookImportWizard;
