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
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SaveIcon from '@mui/icons-material/Save';
import { useAppContext } from '../contexts/AppContext';

const API_URL = '/api';

const AISettings = () => {
  const { fetchWithAuth } = useAppContext();
  const [provider, setProvider] = useState('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [modelPreference, setModelPreference] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success', 'error', or null
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load existing AI config from /api/settings/ai
  useEffect(() => {
    const loadAIConfig = async () => {
      try {
        const response = await fetchWithAuth(`${API_URL}/settings/ai`);
        if (response.ok) {
          const config = await response.json();
          setProvider(config.provider || 'anthropic');
          setModelPreference(config.modelPreference || getDefaultModel(config.provider || 'anthropic'));
          setHasApiKey(config.hasApiKey || false);
          // Don't set apiKey - it's not returned from the server for security
        }
      } catch (error) {
        console.error('Error loading AI config:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (fetchWithAuth) {
      loadAIConfig();
    }
  }, [fetchWithAuth]);

  const getDefaultModel = (selectedProvider) => {
    switch (selectedProvider) {
      case 'anthropic':
        return 'claude-haiku-4-5';
      case 'openai':
        return 'gpt-4o-mini';
      case 'google':
        return 'gemini-2.0-flash';
      default:
        return '';
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);

    try {
      // Map 'gemini' to 'google' for the backend
      const backendProvider = provider === 'gemini' ? 'google' : provider;

      const payload = {
        provider: backendProvider,
        modelPreference,
        isEnabled: true
      };

      // Only include apiKey if user entered one (don't send empty string)
      if (apiKey) {
        payload.apiKey = apiKey;
      }

      const response = await fetchWithAuth(`${API_URL}/settings/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save');
      }

      const config = await response.json();
      setHasApiKey(config.hasApiKey);
      setApiKey(''); // Clear the input after successful save
      setSaveStatus('success');
    } catch (error) {
      console.error('Error saving AI settings:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleProviderChange = (e) => {
    const newProvider = e.target.value;
    setProvider(newProvider);
    setModelPreference(getDefaultModel(newProvider));
    setApiKey(''); // Clear API key when switching providers
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Map backend 'google' to 'gemini' for display
  const displayProvider = provider === 'google' ? 'gemini' : provider;
  const providerLabel = displayProvider.charAt(0).toUpperCase() + displayProvider.slice(1);

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <SmartToyIcon color="primary" sx={{ mr: 1 }} />
          <Typography variant="h6">AI Integration Settings</Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Configure the AI provider used for generating book recommendations.
          You can choose between Anthropic (Claude), OpenAI (ChatGPT), or Google (Gemini).
        </Typography>

        {hasApiKey && (
          <Alert severity="info" sx={{ mb: 2 }}>
            An API key is already configured. Enter a new key below to replace it.
          </Alert>
        )}

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

        <Box component="form" noValidate autoComplete="off">
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel id="ai-provider-label">AI Provider</InputLabel>
            <Select
              labelId="ai-provider-label"
              value={displayProvider}
              label="AI Provider"
              onChange={handleProviderChange}
            >
              <MenuItem value="anthropic">Anthropic (Claude)</MenuItem>
              <MenuItem value="openai">OpenAI (GPT)</MenuItem>
              <MenuItem value="gemini">Google (Gemini)</MenuItem>
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label={`${providerLabel} API Key`}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasApiKey ? '••••••••••••••••' : 'Enter API key'}
            helperText="Your API key is encrypted and stored securely."
            sx={{ mb: 3 }}
          />

          <TextField
            fullWidth
            label="Model Name"
            value={modelPreference}
            onChange={(e) => setModelPreference(e.target.value)}
            helperText="Specify the model version to use."
            sx={{ mb: 3 }}
          />

          <Button
            variant="contained"
            startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default AISettings;