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

const AISettings = () => {
  const { settings, updateSettings, loading } = useAppContext();
  const [provider, setProvider] = useState('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [saveStatus, setSaveStatus] = useState(null); // 'success', 'error', or null
  const [isSaving, setIsSaving] = useState(false);

  // Load existing settings
  useEffect(() => {
    if (settings?.ai) {
      setProvider(settings.ai.provider || 'anthropic');
      setApiKey(settings.ai.apiKey || '');
      setBaseUrl(settings.ai.baseUrl || '');
      setModel(settings.ai.model || '');
    }
  }, [settings]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);

    try {
      const newSettings = {
        ...settings,
        ai: {
          provider,
          apiKey,
          baseUrl,
          model
        }
      };

      await updateSettings(newSettings);
      setSaveStatus('success');
    } catch (error) {
      console.error('Error saving AI settings:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const getProviderDefaults = (selectedProvider) => {
    switch (selectedProvider) {
      case 'anthropic':
        return {
          baseUrl: 'https://api.anthropic.com/v1',
          model: 'claude-3-sonnet-20240229'
        };
      case 'openai':
        return {
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4-turbo'
        };
      case 'gemini':
        return {
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
          model: 'gemini-1.5-pro'
        };
      default:
        return {
          baseUrl: '',
          model: ''
        };
    }
  };

  const handleProviderChange = (e) => {
    const newProvider = e.target.value;
    setProvider(newProvider);
    const defaults = getProviderDefaults(newProvider);
    setBaseUrl(defaults.baseUrl);
    setModel(defaults.model);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <SmartToyIcon color="primary" sx={{ mr: 1 }} />
          <Typography variant="h6">AI Integration Settings</Typography>
        </Box>
        
        <Typography variant="body2" color="text.secondary" paragraph>
          Configure the AI provider used for generating book recommendations. 
          You can choose between Anthropic (Claude), OpenAI (ChatGPT), or Google (Gemini).
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

        <Box component="form" noValidate autoComplete="off">
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel id="ai-provider-label">AI Provider</InputLabel>
            <Select
              labelId="ai-provider-label"
              value={provider}
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
            label="API Key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            helperText="Your API key is stored securely and never shared."
            sx={{ mb: 3 }}
          />

          <TextField
            fullWidth
            label="Base URL (Optional)"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            helperText="Override the default API endpoint URL if needed."
            sx={{ mb: 3 }}
          />

          <TextField
            fullWidth
            label="Model Name"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            helperText="Specify the model version to use (e.g., claude-3-sonnet-20240229, gpt-4-turbo)."
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