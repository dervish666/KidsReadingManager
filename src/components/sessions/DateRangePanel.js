import React from 'react';
import {
  Box,
  Paper,
  TextField,
  IconButton,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { DATE_PRESETS, formatDateISO, getStartOfWeek, getEndOfWeek } from './homeReadingUtils';

/**
 * Right-column date and search controls of the full reading register view.
 * Owns the single-day date picker with prev/next navigation, the date range
 * preset selector (with term options and custom start/end fields), and the
 * student search box.
 *
 * @param {object} props
 * @param {boolean} props.isMobile - Mobile breakpoint flag (layout only)
 * @param {string} props.selectedDate - ISO date for the active register day
 * @param {Function} props.onSelectedDateChange - Sets the active register day
 * @param {string} props.searchQuery - Student name filter text
 * @param {Function} props.onSearchChange - Sets the student name filter
 * @param {object} props.dateRange - Grouped date range controls:
 *   { preset, onPresetChange, customStartDate, onCustomStartDateChange,
 *     customEndDate, onCustomEndDateChange, termDates }
 */
const DateRangePanel = ({
  isMobile,
  selectedDate,
  onSelectedDateChange,
  searchQuery,
  onSearchChange,
  dateRange,
}) => {
  const {
    preset,
    onPresetChange,
    customStartDate,
    onCustomStartDateChange,
    customEndDate,
    onCustomEndDateChange,
    termDates,
  } = dateRange;

  return (
    <Paper sx={{ p: 2, flex: isMobile ? 'none' : 1 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
        {/* Date Picker with Navigation */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton
            size="small"
            onClick={() => {
              const d = new Date(selectedDate + 'T12:00:00');
              d.setDate(d.getDate() - 1);
              onSelectedDateChange(formatDateISO(d));
            }}
            aria-label="Previous day"
          >
            <NavigateBeforeIcon />
          </IconButton>
          <TextField
            label="Date"
            type="date"
            value={selectedDate}
            onChange={(e) => onSelectedDateChange(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
            inputProps={{ 'aria-label': 'Select date for reading session' }}
          />
          <IconButton
            size="small"
            onClick={() => {
              const d = new Date(selectedDate + 'T12:00:00');
              d.setDate(d.getDate() + 1);
              onSelectedDateChange(formatDateISO(d));
            }}
            disabled={selectedDate >= formatDateISO(new Date())}
            aria-label="Next day"
          >
            <NavigateNextIcon />
          </IconButton>
        </Box>

        {/* Date Range Preset */}
        <FormControl data-tour="register-date-range" size="small" fullWidth>
          <InputLabel id="date-preset-label">Date Range</InputLabel>
          <Select
            labelId="date-preset-label"
            value={preset}
            label="Date Range"
            onChange={(e) => {
              const newPreset = e.target.value;
              onPresetChange(newPreset);
              if (newPreset === DATE_PRESETS.CUSTOM) {
                const today = new Date();
                onCustomStartDateChange(formatDateISO(getStartOfWeek(today)));
                onCustomEndDateChange(formatDateISO(getEndOfWeek(today)));
              }
            }}
          >
            <MenuItem value={DATE_PRESETS.THIS_WEEK}>This Week</MenuItem>
            <MenuItem value={DATE_PRESETS.LAST_WEEK}>Last Week</MenuItem>
            <MenuItem value={DATE_PRESETS.LAST_MONTH}>Last Month</MenuItem>
            {termDates.length > 0 && (
              <MenuItem value={DATE_PRESETS.CURRENT_TERM}>Current Term</MenuItem>
            )}
            {termDates.length > 0 && (
              <MenuItem value={DATE_PRESETS.SCHOOL_YEAR}>School Year</MenuItem>
            )}
            {termDates.length > 0 &&
              termDates.map((term) => (
                <MenuItem key={term.termOrder} value={`term_${term.termOrder}`}>
                  {term.termName}
                </MenuItem>
              ))}
            <MenuItem value={DATE_PRESETS.CUSTOM}>Custom</MenuItem>
          </Select>
        </FormControl>

        {preset === DATE_PRESETS.CUSTOM && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              label="Start"
              type="date"
              value={customStartDate}
              onChange={(e) => onCustomStartDateChange(e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
              sx={{ flex: 1 }}
            />
            <TextField
              label="End"
              type="date"
              value={customEndDate}
              onChange={(e) => onCustomEndDateChange(e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
              sx={{ flex: 1 }}
            />
          </Box>
        )}

        {/* Search */}
        <TextField
          placeholder="Search student..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          fullWidth
          inputProps={{ 'aria-label': 'Search for a student by name' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Box>
    </Paper>
  );
};

export default DateRangePanel;
