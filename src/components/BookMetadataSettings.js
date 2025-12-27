import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Divider
} from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SaveIcon from '@mui/icons-material/Save';
import { useAppContext } from '../contexts/AppContext';
import { METADATA_PROVIDERS } from '../utils/bookMetadataApi';

const BookMetadataSettings = () => {
  const { settings, updateSettings, loading } = useAppContext();
  const [provider, setProvider] = useState(METADATA_PROVIDERS.OPEN_LIBRARY);
  const [googleBooksApiKey, setGoogleBooksApiKey] = useState('');
  const [saveStatus, setSaveStatus] = useState(null); // 'success', 'error', or null
  const [isSaving, setIsSaving] = useState(false);

  // Load existing settings
  useEffect(() => {
    if (settings?.bookMetadata) {
      setProvider(settings.bookMetadata.provider || METADATA_PROVIDERS.OPEN_LIBRARY);
      setGoogleBooksApiKey(settings.bookMetadata.googleBooksApiKey || '');
    }
  }, [settings]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);

    try {
      const newSettings = {
        ...settings,
        bookMetadata: {
          provider,
          googleBooksApiKey
        }
      };

      await updateSettings(newSettings);
      setSaveStatus('success');
    } catch (error) {
      console.error('Error saving book metadata settings:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleProviderChange = (e) => {
    setProvider(e.target.value);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const showApiKeyField = provider === METADATA_PROVIDERS.GOOGLE_BOOKS;
  const isGoogleBooksWithoutKey = provider === METADATA_PROVIDERS.GOOGLE_BOOKS && !googleBooksApiKey.trim();

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <MenuBookIcon color="primary" sx={{ mr: 1 }} />
          <Typography variant="h6">Book Metadata Settings</Typography>
        </Box>
        
        <Typography variant="body2" color="text.secondary" paragraph>
          Configure the service used for fetching book metadata (authors, descriptions, genres, cover images).
          Choose between Open Library (free, no API key required) or Google Books (requires API key, often has more comprehensive data).
        </Typography>

        <Divider sx={{ my: 3 }} />

        {saveStatus === 'success' && (
          <Alert severity="success" sx={{ mb: 3 }}>
            Settings saved successfully!
          </Alert>
        )}

        {saveStatus === 'error' && (
          <Alert severity="error" sx={{ mb: 3 }}>
            Failed to save settings. Please try again.
          </Alert>
        )}

        {isGoogleBooksWithoutKey && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            Google Books API requires an API key. Please enter your API key below or switch to Open Library.
          </Alert>
        )}

        <Box component="form" noValidate autoComplete="off">
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel id="metadata-provider-label">Metadata Provider</InputLabel>
            <Select
              labelId="metadata-provider-label"
              value={provider}
              label="Metadata Provider"
              onChange={handleProviderChange}
            >
              <MenuItem value={METADATA_PROVIDERS.OPEN_LIBRARY}>
                Open Library (Free, no API key)
              </MenuItem>
              <MenuItem value={METADATA_PROVIDERS.GOOGLE_BOOKS}>
                Google Books (Requires API key)
              </MenuItem>
            </Select>
          </FormControl>

          {showApiKeyField && (
            <TextField
              fullWidth
              label="Google Books API Key"
              type="password"
              value={googleBooksApiKey}
              onChange={(e) => setGoogleBooksApiKey(e.target.value)}
              helperText="Your API key is stored securely. Get one from the Google Cloud Console."
              sx={{ mb: 3 }}
              error={isGoogleBooksWithoutKey}
            />
          )}

          <Box sx={{ mb: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              Provider Comparison:
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Open Library:</strong> Free, community-driven, good for classic and popular books. May have gaps in newer or niche titles.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              <strong>Google Books:</strong> Comprehensive database, excellent for newer releases and detailed metadata. Requires API key (free tier available with limits).
            </Typography>
          </Box>

          <Button
            variant="contained"
            startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
            onClick={handleSave}
            disabled={isSaving || isGoogleBooksWithoutKey}
          >
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default BookMetadataSettings;
