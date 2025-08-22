import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Alert,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import CodeIcon from '@mui/icons-material/Code';

const JsonEditor = () => {
  const [jsonContent, setJsonContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isValidJson, setIsValidJson] = useState(true);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingSave, setPendingSave] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  // Load JSON content from app_data.json
  const loadJsonContent = async () => {
    try {
      setIsLoading(true);
      setError('');

      const response = await fetch('/api/data/json');
      if (!response.ok) {
        throw new Error(`Failed to load JSON file: ${response.status} ${response.statusText}`);
      }

      const content = await response.text();
      setJsonContent(content);

      // Validate JSON
      try {
        JSON.parse(content);
        setIsValidJson(true);
      } catch (parseError) {
        setIsValidJson(false);
        setError(`JSON is invalid: ${parseError.message}`);
      }
    } catch (err) {
      setError(`Failed to load JSON file: ${err.message}`);
      setJsonContent('');
    } finally {
      setIsLoading(false);
    }
  };

  // Save JSON content to app_data.json
  const saveJsonContent = async (content) => {
    try {
      setError('');

      // Validate JSON before saving
      JSON.parse(content);

      const response = await fetch('/api/data/save-json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save JSON: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success) {
        setShowSuccess(true);
        setIsValidJson(true);
        setJsonContent(content);
        setError('');

        // Reload the page to reflect changes in the app
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        throw new Error(result.message || 'Failed to save JSON');
      }
    } catch (err) {
      setError(`Failed to save JSON: ${err.message}`);
      setIsValidJson(false);
    }
  };

  // Handle text area changes
  const handleContentChange = (event) => {
    const newContent = event.target.value;
    setJsonContent(newContent);

    // Validate JSON
    try {
      JSON.parse(newContent);
      setIsValidJson(true);
      setError('');
    } catch (parseError) {
      setIsValidJson(false);
      setError(`JSON is invalid: ${parseError.message}`);
    }
  };

  // Handle save button click
  const handleSaveClick = () => {
    if (!isValidJson) {
      setError('Cannot save invalid JSON. Please fix the syntax errors first.');
      return;
    }

    setPendingSave(jsonContent);
    setShowConfirmDialog(true);
  };

  // Handle confirmed save
  const handleConfirmSave = () => {
    setShowConfirmDialog(false);
    saveJsonContent(pendingSave);
  };

  // Load content on component mount
  useEffect(() => {
    loadJsonContent();
  }, []);

  if (isLoading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body1">Loading JSON content...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CodeIcon />
        JSON Data Editor
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Edit the app_data.json file directly. Changes will be applied immediately after saving.
        <strong> Warning:</strong> Invalid JSON may break the application. Make sure to validate before saving.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <TextField
          fullWidth
          multiline
          minRows={20}
          maxRows={40}
          value={jsonContent}
          onChange={handleContentChange}
          placeholder="JSON content will appear here..."
          variant="outlined"
          sx={{
            fontFamily: 'monospace',
            '& .MuiInputBase-root': {
              fontFamily: 'monospace',
              fontSize: '0.875rem',
            }
          }}
          error={!isValidJson}
        />
      </Paper>

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<SaveIcon />}
          onClick={handleSaveClick}
          disabled={!isValidJson || isLoading}
        >
          Save Changes
        </Button>

        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={loadJsonContent}
          disabled={isLoading}
        >
          Reload
        </Button>

        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" color={isValidJson ? 'success.main' : 'error.main'}>
            {isValidJson ? '✓ Valid JSON' : '✗ Invalid JSON'}
          </Typography>
        </Box>
      </Box>

      {/* Confirmation Dialog */}
      <Dialog
        open={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
      >
        <DialogTitle>Confirm Save</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to save these changes? This will overwrite the current app_data.json file
            and may affect the application immediately.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowConfirmDialog(false)}>Cancel</Button>
          <Button onClick={handleConfirmSave} variant="contained" color="primary">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Snackbar */}
      <Snackbar
        open={showSuccess}
        autoHideDuration={3000}
        onClose={() => setShowSuccess(false)}
        message="JSON saved successfully! Reloading page..."
      />
    </Box>
  );
};

export default JsonEditor;