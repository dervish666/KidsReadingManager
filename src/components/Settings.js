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
  Snackbar,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RestoreIcon from '@mui/icons-material/Restore';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import { useAppContext } from '../contexts/AppContext';
import ClassManager from './classes/ClassManager'; // Import ClassManager

const Settings = () => {
  const { readingStatusSettings, settings, updateSettings } = useAppContext();

  // Local state for form values
  const [localSettings, setLocalSettings] = useState({
    recentlyReadDays: readingStatusSettings.recentlyReadDays,
    needsAttentionDays: readingStatusSettings.needsAttentionDays,
    streakGracePeriodDays: settings?.streakGracePeriodDays ?? 1
  });

  // State for snackbar
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success'
  });

  // Handle slider change
  const handleSliderChange = (name) => (event, newValue) => {
    setLocalSettings({
      ...localSettings,
      [name]: newValue
    });
  };

  // Handle input change
  const handleInputChange = (name) => (event) => {
    const value = event.target.value === '' ? '' : Number(event.target.value);
    setLocalSettings({
      ...localSettings,
      [name]: value
    });
  };

  // Handle input blur (to validate input)
  const handleBlur = (name, min, max) => () => {
    // Ensure value is treated as a number for comparison
    const numericValue = Number(localSettings[name]);
    if (isNaN(numericValue)) {
        setLocalSettings({ ...localSettings, [name]: min }); // Reset if not a number
        return;
    }
    if (numericValue < min) {
      setLocalSettings({ ...localSettings, [name]: min });
    } else if (numericValue > max) {
      setLocalSettings({ ...localSettings, [name]: max });
    }
  };

  // Handle save settings
  const handleSaveSettings = async () => {
    // Ensure needsAttentionDays is greater than recentlyReadDays
    if (localSettings.needsAttentionDays <= localSettings.recentlyReadDays) {
      setSnackbar({
        open: true,
        message: 'Needs Attention days must be greater than Recently Read days',
        severity: 'error'
      });
      return;
    }

    try {
      // Merge with existing settings and update readingStatusSettings
      await updateSettings({
        ...settings,
        readingStatusSettings: {
          recentlyReadDays: localSettings.recentlyReadDays,
          needsAttentionDays: localSettings.needsAttentionDays
        },
        streakGracePeriodDays: localSettings.streakGracePeriodDays
      });
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
    setLocalSettings({
      recentlyReadDays: readingStatusSettings.recentlyReadDays,
      needsAttentionDays: readingStatusSettings.needsAttentionDays,
      streakGracePeriodDays: settings?.streakGracePeriodDays ?? 1
    });
    setSnackbar({
      open: true,
      message: 'Settings reset to current values',
      severity: 'info'
    });
  };

  // Handle streak grace period change
  const handleStreakGracePeriodChange = (event) => {
    setLocalSettings({
      ...localSettings,
      streakGracePeriodDays: event.target.value
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
      <Paper sx={{ p: 3, mb: 3, pb: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
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
            <Grid size={12}> {/* Ensure full width */}
              <Typography id="recently-read-days-slider" gutterBottom>
                Recently Read (Green): 0-{localSettings.recentlyReadDays} days
              </Typography>
              {/* Use Box with Flexbox for Slider + Input */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Slider
                  sx={{ flexGrow: 1 }} // Slider takes available space
                  value={typeof localSettings.recentlyReadDays === 'number' ? localSettings.recentlyReadDays : 0}
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
                  value={localSettings.recentlyReadDays}
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
            <Grid size={12}> {/* Ensure full width */}
              <Typography id="needs-attention-days-slider" gutterBottom>
                Needs Attention (Yellow): {localSettings.recentlyReadDays + 1}-{localSettings.needsAttentionDays} days
              </Typography>
              {/* Use Box with Flexbox for Slider + Input */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Slider
                  sx={{ flexGrow: 1 }} // Slider takes available space
                  value={typeof localSettings.needsAttentionDays === 'number' ? localSettings.needsAttentionDays : 0}
                  onChange={handleSliderChange('needsAttentionDays')}
                  aria-labelledby="needs-attention-days-slider"
                  valueLabelDisplay="auto"
                  min={localSettings.recentlyReadDays + 1}
                  max={60}
                  marks={[
                    { value: 14, label: '14d' },
                    { value: 30, label: '30d' },
                    { value: 45, label: '45d' },
                    { value: 60, label: '60d' }
                  ]}
                />
                <TextField
                  value={localSettings.needsAttentionDays}
                  onChange={handleInputChange('needsAttentionDays')}
                  onBlur={handleBlur('needsAttentionDays', localSettings.recentlyReadDays + 1, 60)}
                  inputProps={{
                    step: 1,
                    min: localSettings.recentlyReadDays + 1,
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
              Needs Reading (Red): More than {localSettings.needsAttentionDays} days
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Streak Settings Section */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <WhatshotIcon sx={{ color: '#FF6B35' }} />
            <Typography variant="subtitle1">
              Reading Streak Settings
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" paragraph>
            Configure how reading streaks are calculated. The grace period allows students to miss a day without breaking their streak.
          </Typography>

          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel id="streak-grace-period-label">Grace Period</InputLabel>
            <Select
              labelId="streak-grace-period-label"
              id="streak-grace-period"
              value={localSettings.streakGracePeriodDays}
              label="Grace Period"
              onChange={handleStreakGracePeriodChange}
            >
              <MenuItem value={0}>No grace period (strict)</MenuItem>
              <MenuItem value={1}>1 day (recommended)</MenuItem>
              <MenuItem value={2}>2 days</MenuItem>
              <MenuItem value={3}>3 days</MenuItem>
            </Select>
          </FormControl>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {localSettings.streakGracePeriodDays === 0
              ? 'Students must read every day to maintain their streak.'
              : `Students can miss up to ${localSettings.streakGracePeriodDays} day${localSettings.streakGracePeriodDays > 1 ? 's' : ''} without breaking their streak.`
            }
          </Typography>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ display: 'flex', gap: 2, mt: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<SaveIcon />}
            onClick={handleSaveSettings}
            fullWidth
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            Save Settings
          </Button>
  
          <Button
            variant="outlined"
            startIcon={<RestoreIcon />}
            onClick={handleResetSettings}
            fullWidth
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            Reset
          </Button>
        </Box>
      </Paper>

      {/* Class Management Section */}
      <ClassManager />

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