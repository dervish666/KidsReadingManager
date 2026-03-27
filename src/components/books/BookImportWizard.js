import React, { useState, useCallback, useEffect } from 'react';
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
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { parseCSV, detectColumnMapping, mapCSVToBooks } from '../../utils/csvParser';

const steps = ['Upload CSV', 'Map Columns', 'Review Matches', 'Confirm Import'];

const BookImportWizard = ({ open, onClose }) => {
  const { fetchWithAuth } = useAuth();
  const { reloadDataFromServer } = useData();
  const [activeStep, setActiveStep] = useState(0);
  const [csvData, setCsvData] = useState(null);
  const [columnMapping, setColumnMapping] = useState({ title: null, author: null, readingLevel: null, isbn: null, description: null, pageCount: null, publicationYear: null, seriesName: null, seriesNumber: null });
  const [previewResults, setPreviewResults] = useState(null);
  const [selectedConflicts, setSelectedConflicts] = useState({});
  const [selectedPossibleMatches, setSelectedPossibleMatches] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importProgress, setImportProgress] = useState(null);

  // Reset state when dialog reopens
  useEffect(() => {
    if (open) {
      setActiveStep(0);
      setCsvData(null);
      setPreviewResults(null);
      setSelectedConflicts({});
      setSelectedPossibleMatches({});
      setIsLoading(false);
      setError(null);
      setImportResult(null);
      setImportProgress(null);
    }
  }, [open]);

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
    setImportProgress(null);

    try {
      // Build full payload
      const allMatched = previewResults.matched.map(m => ({ existingBookId: m.existingBook.id }));
      const allNewBooks = previewResults.newBooks.map(n => n.importedBook);
      const allConflicts = previewResults.conflicts
        .filter(c => selectedConflicts[c.existingBook.id])
        .map(c => ({
          existingBookId: c.existingBook.id,
          updateReadingLevel: true,
          newReadingLevel: c.importedBook.readingLevel
        }));

      // Also link conflicts that weren't updated
      const unupdatedConflicts = previewResults.conflicts
        .filter(c => !selectedConflicts[c.existingBook.id])
        .map(c => ({ existingBookId: c.existingBook.id }));
      allMatched.push(...unupdatedConflicts);

      // Handle possible matches: accepted ones link to existing, rejected become new books
      if (previewResults.possibleMatches) {
        const acceptedMatches = previewResults.possibleMatches
          .filter(pm => selectedPossibleMatches[pm.existingBook.id])
          .map(pm => ({ existingBookId: pm.existingBook.id }));
        allMatched.push(...acceptedMatches);

        const rejectedMatches = previewResults.possibleMatches
          .filter(pm => !selectedPossibleMatches[pm.existingBook.id])
          .map(pm => pm.importedBook);
        allNewBooks.push(...rejectedMatches);
      }

      // Send in chunks to avoid Worker timeout on large imports
      const CHUNK_SIZE = 200;
      const totalBooks = allMatched.length + allNewBooks.length + allConflicts.length;
      const totals = { linked: 0, created: 0, updated: 0, errors: [] };
      let processed = 0;

      // Send matched books in chunks
      for (let i = 0; i < allMatched.length; i += CHUNK_SIZE) {
        const chunk = allMatched.slice(i, i + CHUNK_SIZE);
        setImportProgress({ processed, total: totalBooks });
        const response = await fetchWithAuth('/api/books/import/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matched: chunk, newBooks: [], conflicts: [] })
        });
        if (!response.ok) throw new Error(`Import chunk failed (matched ${i})`);
        const result = await response.json();
        totals.linked += result.linked || 0;
        totals.updated += result.updated || 0;
        if (result.errors) totals.errors.push(...result.errors);
        processed += chunk.length;
      }

      // Send new books in chunks
      for (let i = 0; i < allNewBooks.length; i += CHUNK_SIZE) {
        const chunk = allNewBooks.slice(i, i + CHUNK_SIZE);
        setImportProgress({ processed, total: totalBooks });
        const response = await fetchWithAuth('/api/books/import/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matched: [], newBooks: chunk, conflicts: [] })
        });
        if (!response.ok) throw new Error(`Import chunk failed (new ${i})`);
        const result = await response.json();
        totals.linked += result.linked || 0;
        totals.created += result.created || 0;
        if (result.errors) totals.errors.push(...result.errors);
        processed += chunk.length;
      }

      // Send conflicts in one go (usually small)
      if (allConflicts.length > 0) {
        setImportProgress({ processed, total: totalBooks });
        const response = await fetchWithAuth('/api/books/import/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matched: [], newBooks: [], conflicts: allConflicts })
        });
        if (!response.ok) throw new Error('Import chunk failed (conflicts)');
        const result = await response.json();
        totals.linked += result.linked || 0;
        totals.updated += result.updated || 0;
        if (result.errors) totals.errors.push(...result.errors);
      }

      setImportResult({
        linked: totals.linked,
        created: totals.created,
        updated: totals.updated,
        errors: totals.errors.length > 0 ? totals.errors : undefined,
        success: totals.errors.length === 0
      });
      setActiveStep(3);
      await reloadDataFromServer();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      setImportProgress(null);
    }
  };

  const handleClose = () => {
    setActiveStep(0);
    setCsvData(null);
    setColumnMapping({ title: null, author: null, readingLevel: null, isbn: null, description: null, pageCount: null, publicationYear: null, seriesName: null, seriesNumber: null });
    setPreviewResults(null);
    setSelectedConflicts({});
    setSelectedPossibleMatches({});
    setError(null);
    setImportResult(null);
    setImportProgress(null);
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
              Only Title is required. Optional columns: Author, Reading Level, ISBN, Description, Page Count, Year, Series
            </Typography>
          </Box>
        );

      case 1: // Column Mapping
        return (
          <Box sx={{ py: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Map your CSV columns to book fields:
            </Typography>
            {(() => {
              const allFields = [
                { key: 'title', label: 'Title *' },
                { key: 'author', label: 'Author' },
                { key: 'readingLevel', label: 'Reading Level' },
                { key: 'isbn', label: 'ISBN' },
                { key: 'description', label: 'Description' },
                { key: 'pageCount', label: 'Page Count' },
                { key: 'publicationYear', label: 'Publication Year' },
                { key: 'seriesName', label: 'Series Name' },
                { key: 'seriesNumber', label: 'Series Number' }
              ];
              return (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                  {allFields.map((field, i) => (
                    <React.Fragment key={field.key}>
                      {i === 4 && <Divider sx={{ my: 0.5 }}><Chip label="Optional metadata" size="small" /></Divider>}
                      <FormControl fullWidth size="small">
                        <InputLabel>{field.label}</InputLabel>
                        <Select
                          value={columnMapping[field.key] ?? ''}
                          label={field.label}
                          onChange={(e) => handleMappingChange(field.key, e.target.value)}
                        >
                          <MenuItem value="">Not mapped</MenuItem>
                          {csvData?.headers.map((header, idx) => (
                            <MenuItem key={idx} value={idx}>{header}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </React.Fragment>
                  ))}
                </Box>
              );
            })()}
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
            <Typography variant="h6" color={importResult?.errors ? 'warning.main' : 'success.main'} gutterBottom>
              {importResult?.errors ? 'Import Partially Complete' : 'Import Complete!'}
            </Typography>
            {importResult && (
              <Box sx={{ mt: 2 }}>
                <Typography>Linked: {importResult.linked} books</Typography>
                <Typography>Created: {importResult.created} books</Typography>
                <Typography>Updated: {importResult.updated} books</Typography>
                {importResult.errors && (
                  <Box sx={{ mt: 2 }}>
                    <Typography color="error.main">
                      {importResult.errors.length} errors occurred
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      First error: {importResult.errors[0]?.error || JSON.stringify(importResult.errors[0])}
                    </Typography>
                  </Box>
                )}
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

        {isLoading && (
          importProgress ? (
            <Box sx={{ mb: 2 }}>
              <LinearProgress variant="determinate" value={(importProgress.processed / importProgress.total) * 100} sx={{ mb: 0.5 }} />
              <Typography variant="caption" color="text.secondary" align="center" display="block">
                Importing {importProgress.processed} / {importProgress.total} books...
              </Typography>
            </Box>
          ) : (
            <LinearProgress sx={{ mb: 2 }} />
          )
        )}
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
