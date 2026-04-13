import React, { useState, useEffect, useCallback } from 'react';
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
  Divider,
  Chip,
  Stack,
  InputAdornment,
} from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SaveIcon from '@mui/icons-material/Save';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { useAuth } from '../contexts/AuthContext';

const API_URL = '/api';

// Curated fallback lists shown before / if the live fetch fails
const STATIC_MODELS = {
  anthropic: [
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 (Fast)' },
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5 (Balanced)' },
    { id: 'claude-opus-4-5', name: 'Claude Opus 4.5 (Most Capable)' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
  ],
  openai: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast)' },
    { id: 'gpt-4o', name: 'GPT-4o (Balanced)' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
  ],
  google: [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Fast)' },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro' },
  ],
};

const AISettings = () => {
  const { fetchWithAuth } = useAuth();
  const [provider, setProvider] = useState('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [modelPreference, setModelPreference] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [availableProviders, setAvailableProviders] = useState({});
  const [keySource, setKeySource] = useState('none');
  const [saveStatus, setSaveStatus] = useState(null); // 'success', 'error', or null
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchedModels, setFetchedModels] = useState(null); // null = not fetched yet
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelFetchError, setModelFetchError] = useState(null);

  // Load existing AI config from /api/settings/ai, then fetch live model list if key exists
  useEffect(() => {
    const loadAIConfig = async () => {
      try {
        const response = await fetchWithAuth(`${API_URL}/settings/ai`);
        if (response.ok) {
          const config = await response.json();
          const loadedProvider = config.provider || 'anthropic';
          setProvider(loadedProvider);
          setModelPreference(config.modelPreference || getDefaultModel(loadedProvider));
          setHasApiKey(config.hasApiKey || false);
          setAvailableProviders(config.availableProviders || {});
          setKeySource(config.keySource || 'none');

          // If a key is already saved, silently fetch the live model list
          if (config.hasApiKey) {
            try {
              const modelsRes = await fetchWithAuth(`${API_URL}/settings/ai/models`);
              if (modelsRes.ok) {
                const { models: live } = await modelsRes.json();
                if (live && live.length > 0) {
                  setFetchedModels(live);
                }
              }
            } catch {
              // Non-fatal — static model list will be shown as fallback
            }
          }
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

  // Returns the model list to display: fetched > static fallback
  const getDisplayModels = useCallback(
    (providerKey) => {
      const key = providerKey === 'gemini' ? 'google' : providerKey;
      if (fetchedModels && fetchedModels.length > 0) return fetchedModels;
      return STATIC_MODELS[key] || [];
    },
    [fetchedModels]
  );

  // Fetch live model list from the provider via our backend proxy
  const fetchModels = useCallback(
    async (keyToUse, providerToUse) => {
      if (!keyToUse) return;
      const backendProvider = providerToUse === 'gemini' ? 'google' : providerToUse;
      setIsLoadingModels(true);
      setModelFetchError(null);
      try {
        const response = await fetchWithAuth(`${API_URL}/settings/ai/models`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: backendProvider, apiKey: keyToUse }),
        });
        if (!response.ok) {
          const err = await response.json();
          setModelFetchError(err.error || 'Could not verify key');
          return;
        }
        const { models: live } = await response.json();
        if (live && live.length > 0) {
          setFetchedModels(live);
          // Keep current selection if it exists in the live list, otherwise pick first
          if (!live.find((m) => m.id === modelPreference)) {
            setModelPreference(live[0].id);
          }
        }
      } catch {
        setModelFetchError('Could not reach provider API');
      } finally {
        setIsLoadingModels(false);
      }
    },
    [fetchWithAuth, modelPreference]
  );

  const handleApiKeyBlur = () => {
    if (apiKey) {
      fetchModels(apiKey, displayProvider);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);

    try {
      const backendProvider = provider === 'gemini' ? 'google' : provider;

      const payload = {
        provider: backendProvider,
        modelPreference,
        isEnabled: true,
      };

      if (apiKey) {
        payload.apiKey = apiKey;
      }

      const response = await fetchWithAuth(`${API_URL}/settings/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save');
      }

      const config = await response.json();
      setHasApiKey(config.hasApiKey);
      setAvailableProviders(config.availableProviders || {});
      setKeySource(config.keySource || 'none');
      setApiKey('');
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
    setApiKey('');
    setFetchedModels(null);
    setModelFetchError(null);
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const displayProvider = provider === 'google' ? 'gemini' : provider;
  const providerLabel = displayProvider.charAt(0).toUpperCase() + displayProvider.slice(1);

  const getProviderInfo = (providerKey) => {
    const names = {
      anthropic: 'Anthropic (Claude)',
      openai: 'OpenAI (GPT)',
      google: 'Google (Gemini)',
    };
    return names[providerKey] || providerKey;
  };

  const currentProviderKey = displayProvider === 'gemini' ? 'google' : displayProvider;
  const hasCurrentProviderKey = availableProviders[currentProviderKey] || false;

  const displayModels = getDisplayModels(displayProvider);
  // Ensure the currently-saved model appears even if it's not in the list
  const modelOptions =
    modelPreference && !displayModels.find((m) => m.id === modelPreference)
      ? [{ id: modelPreference, name: modelPreference }, ...displayModels]
      : displayModels;

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <SmartToyIcon color="primary" sx={{ mr: 1 }} />
          <Typography variant="h6">AI Integration Settings</Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Configure the AI provider used for generating book recommendations. You can choose between
          Anthropic (Claude), OpenAI (ChatGPT), or Google (Gemini).
        </Typography>

        {/* Provider Status Overview */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'grey.50' }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            Provider Status
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {['anthropic', 'openai', 'google'].map((p) => {
              const hasKey = availableProviders[p] || false;
              const isActive = (p === 'google' ? 'gemini' : p) === displayProvider;
              return (
                <Chip
                  key={p}
                  icon={hasKey ? <CheckCircleIcon /> : <CancelIcon />}
                  label={getProviderInfo(p)}
                  color={isActive ? 'primary' : hasKey ? 'success' : 'default'}
                  variant={isActive ? 'filled' : 'outlined'}
                  size="small"
                  sx={{
                    '& .MuiChip-icon': {
                      color: hasKey ? (isActive ? 'inherit' : 'success.main') : 'text.disabled',
                    },
                  }}
                />
              );
            })}
          </Stack>
          {keySource !== 'none' && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Active key source:{' '}
              {keySource === 'organization'
                ? 'Organization settings'
                : keySource === 'platform'
                  ? 'Platform key (owner-managed)'
                  : 'Environment variable'}
            </Typography>
          )}
        </Paper>

        {!hasCurrentProviderKey && keySource === 'none' && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            No API key configured for {getProviderInfo(currentProviderKey)}. Book recommendations
            will use fallback suggestions.
          </Alert>
        )}

        {hasApiKey && (
          <Alert severity="info" sx={{ mb: 2 }}>
            An API key is already configured for this provider. Enter a new key below to replace it.
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
              <MenuItem value="anthropic">
                Anthropic (Claude) {availableProviders.anthropic && '✓'}
              </MenuItem>
              <MenuItem value="openai">OpenAI (GPT) {availableProviders.openai && '✓'}</MenuItem>
              <MenuItem value="gemini">Google (Gemini) {availableProviders.google && '✓'}</MenuItem>
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label={`${providerLabel} API Key`}
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              // Clear fetched models when key is edited so they re-fetch on blur
              if (fetchedModels) {
                setFetchedModels(null);
                setModelFetchError(null);
              }
            }}
            onBlur={handleApiKeyBlur}
            placeholder={hasApiKey ? '••••••••••••••••' : 'Enter API key'}
            helperText={
              modelFetchError
                ? modelFetchError
                : fetchedModels
                  ? `✓ Key verified — ${fetchedModels.length} models loaded`
                  : hasApiKey
                    ? 'Your API key is encrypted and stored securely.'
                    : 'Enter your key — models will load automatically when you move focus away.'
            }
            error={Boolean(modelFetchError)}
            sx={{ mb: 3 }}
          />

          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel id="model-label">Model</InputLabel>
            <Select
              labelId="model-label"
              value={modelOptions.find((m) => m.id === modelPreference) ? modelPreference : ''}
              label="Model"
              onChange={(e) => setModelPreference(e.target.value)}
              disabled={isLoadingModels}
              endAdornment={
                isLoadingModels ? (
                  <InputAdornment position="end" sx={{ mr: 2 }}>
                    <CircularProgress size={18} />
                  </InputAdornment>
                ) : null
              }
            >
              {modelOptions.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.name}
                </MenuItem>
              ))}
            </Select>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.75 }}>
              {fetchedModels
                ? 'Live model list from provider.'
                : 'Showing common models. Enter an API key to load the full list.'}
            </Typography>
          </FormControl>

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
