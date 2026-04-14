import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Divider,
  Chip,
  Stack,
  IconButton,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  Tooltip,
  Select,
  MenuItem,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useAuth } from '../contexts/AuthContext';

const API_URL = '/api';

const PROVIDERS = [
  { key: 'anthropic', name: 'Anthropic', description: 'Claude models' },
  { key: 'openai', name: 'OpenAI', description: 'GPT models' },
  { key: 'google', name: 'Google', description: 'Gemini models' },
];

const PlatformSettings = () => {
  const { fetchWithAuth } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [keys, setKeys] = useState({});
  const [activeProvider, setActiveProvider] = useState(null);
  const [apiKeys, setApiKeys] = useState({ anthropic: '', openai: '', google: '' });
  const [savingProvider, setSavingProvider] = useState(null);
  const [deletingProvider, setDeletingProvider] = useState(null);
  const [settingActive, setSettingActive] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', message }
  const [models, setModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const fetchModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const response = await fetchWithAuth(`${API_URL}/settings/platform-ai/models`);
      if (response.ok) {
        const data = await response.json();
        setModels(data.models || []);
      }
    } catch (error) {
      console.error('Error fetching models:', error);
    } finally {
      setLoadingModels(false);
    }
  }, [fetchWithAuth]);

  const showFeedback = useCallback((type, message) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }, []);

  // Load current platform AI config
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetchWithAuth(`${API_URL}/settings/platform-ai`);
        if (response.ok) {
          const data = await response.json();
          setKeys(data.keys || {});
          setActiveProvider(data.activeProvider || null);
        }
      } catch (error) {
        console.error('Error loading platform AI config:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (fetchWithAuth) {
      loadConfig();
    }
  }, [fetchWithAuth]);

  // Set selected model from current key state
  useEffect(() => {
    if (activeProvider && keys[activeProvider]) {
      setSelectedModel(keys[activeProvider].modelPreference || '');
    } else {
      setSelectedModel('');
    }
  }, [activeProvider, keys]);

  // Fetch models when active provider changes
  useEffect(() => {
    if (activeProvider) {
      fetchModels();
    } else {
      setModels([]);
    }
  }, [activeProvider, fetchModels]);

  const handleSaveKey = async (provider) => {
    const key = apiKeys[provider];
    if (!key) return;

    setSavingProvider(provider);
    try {
      const response = await fetchWithAuth(`${API_URL}/settings/platform-ai`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: key, setActive: false }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save');
      }

      const data = await response.json();
      setKeys(data.keys || {});
      setActiveProvider(data.activeProvider || null);
      setApiKeys((prev) => ({ ...prev, [provider]: '' }));
      showFeedback('success', `${getProviderName(provider)} API key saved successfully.`);
    } catch (error) {
      console.error('Error saving API key:', error);
      showFeedback('error', `Failed to save ${getProviderName(provider)} key. ${error.message}`);
    } finally {
      setSavingProvider(null);
    }
  };

  const requestDeleteKey = (provider) => {
    setDeleteTarget(provider);
    setDeleteConfirmText('');
  };

  const cancelDeleteKey = () => {
    setDeleteTarget(null);
    setDeleteConfirmText('');
  };

  const confirmDeleteKey = async () => {
    const provider = deleteTarget;
    if (!provider) return;

    setDeleteTarget(null);
    setDeleteConfirmText('');
    setDeletingProvider(provider);
    try {
      const response = await fetchWithAuth(`${API_URL}/settings/platform-ai/${provider}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete');
      }

      // Update local state
      setKeys((prev) => {
        const updated = { ...prev };
        delete updated[provider];
        return updated;
      });
      // If the deleted provider was active, clear active
      if (activeProvider === provider) {
        setActiveProvider(null);
      }
      setApiKeys((prev) => ({ ...prev, [provider]: '' }));
      showFeedback('success', `${getProviderName(provider)} API key removed.`);
    } catch (error) {
      console.error('Error deleting API key:', error);
      showFeedback('error', `Failed to remove ${getProviderName(provider)} key. ${error.message}`);
    } finally {
      setDeletingProvider(null);
    }
  };

  const handleSetActive = async (provider) => {
    setSettingActive(true);
    try {
      const response = await fetchWithAuth(`${API_URL}/settings/platform-ai`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, setActive: true }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to set active provider');
      }

      const data = await response.json();
      setKeys(data.keys || {});
      setActiveProvider(data.activeProvider || null);
      showFeedback('success', `${getProviderName(provider)} set as the active provider.`);
    } catch (error) {
      console.error('Error setting active provider:', error);
      showFeedback('error', `Failed to set active provider. ${error.message}`);
    } finally {
      setSettingActive(false);
    }
  };

  const handleModelChange = async (newModel) => {
    setSelectedModel(newModel);
    try {
      const response = await fetchWithAuth(`${API_URL}/settings/platform-ai`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: activeProvider,
          setActive: true,
          modelPreference: newModel || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update model');
      }

      const data = await response.json();
      setKeys(data.keys || {});
      setActiveProvider(data.activeProvider || null);
      showFeedback('success', `Default model updated.`);
    } catch (error) {
      console.error('Error updating model:', error);
      showFeedback('error', `Failed to update model. ${error.message}`);
      // Revert selection on failure
      if (activeProvider && keys[activeProvider]) {
        setSelectedModel(keys[activeProvider].modelPreference || '');
      }
    }
  };

  const getProviderName = (key) => {
    const provider = PROVIDERS.find((p) => p.key === key);
    return provider ? provider.name : key;
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const configuredProviders = PROVIDERS.filter((p) => keys[p.key]?.configured);

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <SmartToyIcon color="primary" sx={{ mr: 1 }} />
          <Typography variant="h6">Platform AI Keys</Typography>
        </Box>

        <Alert
          severity="info"
          icon={<InfoOutlinedIcon />}
          sx={{ mb: 3, bgcolor: 'rgba(122, 158, 173, 0.08)' }}
        >
          These keys are used for schools with the AI add-on that haven't configured their own key.
        </Alert>

        {feedback && (
          <Alert severity={feedback.type} sx={{ mb: 3 }} onClose={() => setFeedback(null)}>
            {feedback.message}
          </Alert>
        )}

        {/* Provider sections */}
        {PROVIDERS.map((provider, index) => {
          const providerState = keys[provider.key] || {};
          const isConfigured = providerState.configured || false;
          const isActive = activeProvider === provider.key;
          const isSaving = savingProvider === provider.key;
          const isDeleting = deletingProvider === provider.key;
          const keyValue = apiKeys[provider.key];

          return (
            <React.Fragment key={provider.key}>
              {index > 0 && <Divider sx={{ my: 3 }} />}

              <Box>
                {/* Provider header */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    mb: 2,
                    flexWrap: 'wrap',
                    gap: 1,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      {provider.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      ({provider.description})
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Chip
                      icon={isConfigured ? <CheckCircleIcon /> : undefined}
                      label={isConfigured ? 'Configured' : 'Not configured'}
                      color={isConfigured ? 'success' : 'default'}
                      variant={isConfigured ? 'filled' : 'outlined'}
                      size="small"
                    />
                    {isActive && (
                      <Chip label="Active" color="primary" variant="filled" size="small" />
                    )}
                  </Stack>
                </Box>

                {/* Last updated */}
                {isConfigured && providerState.updatedAt && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mb: 1.5 }}
                  >
                    Last updated:{' '}
                    {new Date(providerState.updatedAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Typography>
                )}

                {/* API key input + actions */}
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <TextField
                    fullWidth
                    size="small"
                    type="password"
                    value={keyValue}
                    onChange={(e) =>
                      setApiKeys((prev) => ({ ...prev, [provider.key]: e.target.value }))
                    }
                    placeholder={
                      isConfigured
                        ? 'Key configured \u2014 enter new key to replace'
                        : 'Enter API key'
                    }
                    sx={{ flex: 1 }}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={
                      isSaving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />
                    }
                    onClick={() => handleSaveKey(provider.key)}
                    disabled={!keyValue || isSaving}
                    sx={{ minWidth: 90, minHeight: 40 }}
                  >
                    {isSaving ? 'Saving' : 'Save'}
                  </Button>
                  {isConfigured && (
                    <Tooltip title="Remove API key">
                      <IconButton
                        color="error"
                        onClick={() => requestDeleteKey(provider.key)}
                        disabled={isDeleting}
                        size="small"
                        sx={{ minWidth: 40, minHeight: 40 }}
                        aria-label={`Remove ${provider.name} API key`}
                      >
                        {isDeleting ? <CircularProgress size={18} /> : <DeleteIcon />}
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </Box>
            </React.Fragment>
          );
        })}

        {/* Active provider selection */}
        <Divider sx={{ my: 3 }} />

        <FormControl
          component="fieldset"
          disabled={settingActive || configuredProviders.length === 0}
        >
          <FormLabel
            component="legend"
            sx={{
              fontWeight: 700,
              fontFamily: '"Nunito", sans-serif',
              mb: 1,
              '&.Mui-focused': { color: 'primary.main' },
            }}
          >
            Active Provider
          </FormLabel>
          {configuredProviders.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Configure at least one provider above to select an active provider.
            </Typography>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                The active provider will be used for AI recommendations when a school hasn't set
                their own key.
              </Typography>
              <RadioGroup
                value={activeProvider || ''}
                onChange={(e) => handleSetActive(e.target.value)}
              >
                {configuredProviders.map((provider) => (
                  <FormControlLabel
                    key={provider.key}
                    value={provider.key}
                    control={<Radio size="small" />}
                    label={`${provider.name} (${provider.description})`}
                    sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.9rem' } }}
                  />
                ))}
              </RadioGroup>
              {settingActive && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                  <CircularProgress size={16} />
                  <Typography variant="caption" color="text.secondary">
                    Updating active provider...
                  </Typography>
                </Box>
              )}
            </>
          )}
        </FormControl>

        {/* Default model selection */}
        {activeProvider && keys[activeProvider]?.configured && (
          <>
            <Divider sx={{ my: 3 }} />

            <Box>
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 700,
                  fontFamily: '"Nunito", sans-serif',
                  mb: 1,
                }}
              >
                Default Model
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                The default model used for AI recommendations. Leave as "Default" to use the
                provider's standard model.
              </Typography>

              {loadingModels ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={20} />
                  <Typography variant="body2" color="text.secondary">
                    Loading available models...
                  </Typography>
                </Box>
              ) : (
                <FormControl fullWidth size="small">
                  <InputLabel>Model</InputLabel>
                  <Select
                    value={selectedModel}
                    label="Model"
                    onChange={(e) => handleModelChange(e.target.value)}
                  >
                    <MenuItem value="">
                      <em>Default (provider decides)</em>
                    </MenuItem>
                    {models.map((model) => (
                      <MenuItem key={model.id} value={model.id}>
                        {model.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Box>
          </>
        )}
      </Paper>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={cancelDeleteKey}
        aria-labelledby="platform-ai-delete-title"
      >
        <DialogTitle id="platform-ai-delete-title">
          Remove {deleteTarget ? getProviderName(deleteTarget) : ''} key?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            This disables AI features for every school relying on the platform{' '}
            {deleteTarget ? getProviderName(deleteTarget) : ''} key. Schools with their own key are
            unaffected. Type <strong>DELETE</strong> to confirm.
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="DELETE"
            inputProps={{ 'aria-label': 'Type DELETE to confirm' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelDeleteKey}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={confirmDeleteKey}
            disabled={deleteConfirmText !== 'DELETE'}
          >
            Remove key
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PlatformSettings;
