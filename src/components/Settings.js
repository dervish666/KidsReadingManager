import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Slider,
  TextField,
  Button,
  Grid, // Keep outer Grid
  Divider,
  Alert,
  Snackbar
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RestoreIcon from '@mui/icons-material/Restore';
import { useAppContext } from '../contexts/AppContext';

const Settings = () => {
  const { readingStatusSettings, updateReadingStatusSettings } = useAppContext();

  // Local state for settings
  const [settings, setSettings] = useState({
    recentlyReadDays: readingStatusSettings.recentlyReadDays,
    needsAttentionDays: readingStatusSettings.needsAttentionDays
  });

  // State for snackbar
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success'
  });

  // Handle slider change
  const handleSliderChange = (name) => (event, newValue) => {
    setSettings({
      ...settings,
      [name]: newValue
    });
  };

  // Handle input change
  const handleInputChange = (name) => (event) => {
    const value = event.target.value === '' ? '' : Number(event.target.value);
    setSettings({
      ...settings,
      [name]: value
    });
  };

  // Handle input blur (to validate input)
  const handleBlur = (name, min, max) => () => {
    // Ensure value is treated as a number for comparison
    const numericValue = Number(settings[name]);
    if (isNaN(numericValue)) {
        setSettings({ ...settings, [name]: min }); // Reset if not a number
        return;
    }
    if (numericValue < min) {
      setSettings({ ...settings, [name]: min });
    } else if (numericValue > max) {
      setSettings({ ...settings, [name]: max });
    }
  };

  // Handle save settings
  const handleSaveSettings = async () => {
    // Ensure needsAttentionDays is greater than recentlyReadDays
    if (settings.needsAttentionDays <= settings.recentlyReadDays) {
      setSnackbar({
        open: true,
        message: 'Needs Attention days must be greater than Recently Read days',
        severity: 'error'
      });
      return;
    }

    try {
      await updateReadingStatusSettings(settings);
      setSnackbar({
        open: true,
        message: 'Settings saved successfully',
        severity: 'success'
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Error saving settings: ${error.message}`,
        severity: 'error'
      });
    }
  };

  // Handle reset settings
  const handleResetSettings = () => {
    setSettings({
      recentlyReadDays: readingStatusSettings.recentlyReadDays,
      needsAttentionDays: readingStatusSettings.needsAttentionDays
    });
    setSnackbar({
      open: true,
      message: 'Settings reset to current values',
      severity: 'info'
    });
  };

  // Handle close snackbar
  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  return (
    <Box sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h6" gutterBottom>
        Application Settings
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Reading Status Durations
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Configure how many days determine each reading status. These settings affect how students are prioritized and color-coded in the application.
        </Typography>

        <Box sx={{ mt: 4, mb: 4 }}>
          {/* Use outer Grid for overall layout */}
          <Grid container spacing={4}>
            {/* Section for Recently Read */}
            <Grid item xs={12} md={6}>
              <Typography id="recently-read-days-slider" gutterBottom>
                Recently Read (Green): 0-{settings.recentlyReadDays} days
              </Typography>
              {/* Use Box with Flexbox for Slider + Input */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Slider
                  sx={{ flexGrow: 1 }} // Slider takes available space
                  value={typeof settings.recentlyReadDays === 'number' ? settings.recentlyReadDays : 0}
                  onChange={handleSliderChange('recentlyReadDays')}
                  aria-labelledby="recently-read-days-slider"
                  valueLabelDisplay="auto"
                  min={1}
                  max={30}
                  marks={[
                    { value: 1, label: '1d' },
                    { value: 7, label: '7d' },
                    { value: 14, label: '14d' },
                    { value: 30, label: '30d' }
                  ]}
                />
                <TextField
                  value={settings.recentlyReadDays}
                  onChange={handleInputChange('recentlyReadDays')}
                  onBlur={handleBlur('recentlyReadDays', 1, 30)}
                  inputProps={{
                    step: 1,
                    min: 1,
                    max: 30,
                    type: 'number',
                    'aria-labelledby': 'recently-read-days-slider',
                  }}
                  sx={{ width: 60 }} // Fixed width for input
                  size="small"
                />
              </Box>
            </Grid>

            {/* Section for Needs Attention */}
            <Grid item xs={12} md={6}>
              <Typography id="needs-attention-days-slider" gutterBottom>
                Needs Attention (Yellow): {settings.recentlyReadDays + 1}-{settings.needsAttentionDays} days
              </Typography>
              {/* Use Box with Flexbox for Slider + Input */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Slider
                  sx={{ flexGrow: 1 }} // Slider takes available space
                  value={typeof settings.needsAttentionDays === 'number' ? settings.needsAttentionDays : 0}
                  onChange={handleSliderChange('needsAttentionDays')}
                  aria-labelledby="needs-attention-days-slider"
                  valueLabelDisplay="auto"
                  min={settings.recentlyReadDays + 1}
                  max={60}
                  marks={[
                    { value: 14, label: '14d' },
                    { value: 30, label: '30d' },
                    { value: 45, label: '45d' },
                    { value: 60, label: '60d' }
                  ]}
                />
                <TextField
                  value={settings.needsAttentionDays}
                  onChange={handleInputChange('needsAttentionDays')}
                  onBlur={handleBlur('needsAttentionDays', settings.recentlyReadDays + 1, 60)}
                  inputProps={{
                    step: 1,
                    min: settings.recentlyReadDays + 1,
                    max: 60,
                    type: 'number',
                    'aria-labelledby': 'needs-attention-days-slider',
                  }}
                  sx={{ width: 60 }} // Fixed width for input
                  size="small"
                />
              </Box>
            </Grid>
          </Grid>

          <Box sx={{ mt: 4 }}> {/* Increased margin top */}
            <Typography variant="body2" color="text.secondary">
              Needs Reading (Red): More than {settings.needsAttentionDays} days
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<SaveIcon />}
            onClick={handleSaveSettings}
          >
            Save Settings
          </Button>

          <Button
            variant="outlined"
            startIcon={<RestoreIcon />}
            onClick={handleResetSettings}
          >
            Reset
          </Button>
        </Box>
      </Paper>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Settings;