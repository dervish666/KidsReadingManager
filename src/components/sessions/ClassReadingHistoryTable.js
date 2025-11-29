import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Tooltip,
  useTheme,
  useMediaQuery
} from '@mui/material';

// Reading status types (matching HomeReadingRegister)
const READING_STATUS = {
  READ: 'read',
  MULTIPLE: 'multiple',
  ABSENT: 'absent',
  NO_RECORD: 'no_record',
  NONE: 'none'
};

// Date range presets
const DATE_PRESETS = {
  THIS_WEEK: 'this_week',
  LAST_WEEK: 'last_week',
  LAST_MONTH: 'last_month',
  CUSTOM: 'custom'
};

// Get start of week (Monday)
const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Get end of week (Sunday)
const getEndOfWeek = (date) => {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

// Get start of month
const getStartOfMonth = (date) => {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Get end of month
const getEndOfMonth = (date) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  d.setHours(23, 59, 59, 999);
  return d;
};

// Format date for display (short)
const formatDateShort = (date) => {
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric'
  });
};

// Format date for header
const formatDateHeader = (date) => {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    day: dayNames[date.getDay()],
    date: date.getDate()
  };
};

// Format date as YYYY-MM-DD for comparison
const formatDateISO = (date) => {
  return date.toISOString().split('T')[0];
};

// Generate array of dates between start and end
const getDateRange = (start, end) => {
  const dates = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

const ClassReadingHistoryTable = ({ students, books }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  // State for date range
  const [datePreset, setDatePreset] = useState(DATE_PRESETS.THIS_WEEK);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Calculate date range based on preset
  const { startDate, endDate } = useMemo(() => {
    const today = new Date();
    
    switch (datePreset) {
      case DATE_PRESETS.THIS_WEEK:
        return {
          startDate: getStartOfWeek(today),
          endDate: getEndOfWeek(today)
        };
      case DATE_PRESETS.LAST_WEEK: {
        const lastWeek = new Date(today);
        lastWeek.setDate(lastWeek.getDate() - 7);
        return {
          startDate: getStartOfWeek(lastWeek),
          endDate: getEndOfWeek(lastWeek)
        };
      }
      case DATE_PRESETS.LAST_MONTH: {
        const lastMonth = new Date(today);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        return {
          startDate: getStartOfMonth(lastMonth),
          endDate: getEndOfMonth(lastMonth)
        };
      }
      case DATE_PRESETS.CUSTOM:
        return {
          startDate: customStartDate ? new Date(customStartDate) : getStartOfWeek(today),
          endDate: customEndDate ? new Date(customEndDate) : getEndOfWeek(today)
        };
      default:
        return {
          startDate: getStartOfWeek(today),
          endDate: getEndOfWeek(today)
        };
    }
  }, [datePreset, customStartDate, customEndDate]);

  // Generate dates array for columns
  const dates = useMemo(() => {
    return getDateRange(startDate, endDate);
  }, [startDate, endDate]);

  // Get reading status for a student on a specific date
  const getStudentReadingStatus = (student, dateStr) => {
    const sessions = student.readingSessions.filter(
      s => s.date === dateStr && s.location === 'home'
    );
    
    if (sessions.length === 0) return { status: READING_STATUS.NONE, count: 0 };
    
    // Check for absent marker
    const absentSession = sessions.find(s => s.notes?.includes('[ABSENT]'));
    if (absentSession) return { status: READING_STATUS.ABSENT, count: 0 };
    
    // Check for no record marker
    const noRecordSession = sessions.find(s => s.notes?.includes('[NO_RECORD]'));
    if (noRecordSession) return { status: READING_STATUS.NO_RECORD, count: 0 };
    
    // Check for reading count stored in notes (format: [COUNT:N])
    const sessionWithCount = sessions.find(s => s.notes?.match(/\[COUNT:(\d+)\]/));
    if (sessionWithCount) {
      const match = sessionWithCount.notes.match(/\[COUNT:(\d+)\]/);
      const count = parseInt(match[1], 10);
      if (count > 1) {
        return { status: READING_STATUS.MULTIPLE, count };
      }
      return { status: READING_STATUS.READ, count: 1 };
    }
    
    // Legacy: count actual sessions if no COUNT marker
    if (sessions.length === 1) return { status: READING_STATUS.READ, count: 1 };
    return { status: READING_STATUS.MULTIPLE, count: sessions.length };
  };

  // Calculate total sessions for a student in the date range
  const getStudentTotalInRange = (student) => {
    let total = 0;
    dates.forEach(date => {
      const dateStr = formatDateISO(date);
      const { status, count } = getStudentReadingStatus(student, dateStr);
      if (status === READING_STATUS.READ) {
        total += 1;
      } else if (status === READING_STATUS.MULTIPLE) {
        total += count;
      }
    });
    return total;
  };

  // Render status cell
  const renderStatusCell = (student, date) => {
    const dateStr = formatDateISO(date);
    const { status, count } = getStudentReadingStatus(student, dateStr);
    
    const cellStyle = {
      textAlign: 'center',
      fontWeight: 'bold',
      fontSize: isMobile ? '0.75rem' : '0.9rem',
      padding: isMobile ? '4px 2px' : '8px 4px',
      minWidth: isMobile ? 30 : 40
    };

    switch (status) {
      case READING_STATUS.READ:
        return (
          <TableCell sx={{ ...cellStyle, backgroundColor: 'success.light', color: 'success.dark' }}>
            ✓
          </TableCell>
        );
      case READING_STATUS.MULTIPLE:
        return (
          <TableCell sx={{ ...cellStyle, backgroundColor: 'success.main', color: 'white' }}>
            {count}
          </TableCell>
        );
      case READING_STATUS.ABSENT:
        return (
          <TableCell sx={{ ...cellStyle, backgroundColor: 'warning.light', color: 'warning.dark' }}>
            A
          </TableCell>
        );
      case READING_STATUS.NO_RECORD:
        return (
          <TableCell sx={{ ...cellStyle, backgroundColor: 'grey.200', color: 'grey.600' }}>
            •
          </TableCell>
        );
      default:
        return (
          <TableCell sx={{ ...cellStyle, color: 'grey.400' }}>
            -
          </TableCell>
        );
    }
  };

  // Sort students alphabetically
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  // Handle preset change
  const handlePresetChange = (event) => {
    const newPreset = event.target.value;
    setDatePreset(newPreset);
    
    // Set default custom dates when switching to custom
    if (newPreset === DATE_PRESETS.CUSTOM) {
      const today = new Date();
      setCustomStartDate(formatDateISO(getStartOfWeek(today)));
      setCustomEndDate(formatDateISO(getEndOfWeek(today)));
    }
  };

  // Format date range for display
  const formatDateRangeDisplay = () => {
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    return `${startDate.toLocaleDateString('en-GB', options)} - ${endDate.toLocaleDateString('en-GB', options)}`;
  };

  if (students.length === 0) {
    return null;
  }

  return (
    <Paper sx={{ p: 2, mt: 2 }}>
      <Typography variant="h6" gutterBottom>
        Reading History
      </Typography>

      {/* Date Range Controls */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        gap: 2, 
        mb: 2,
        alignItems: isMobile ? 'stretch' : 'center'
      }}>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="date-preset-label">Date Range</InputLabel>
          <Select
            labelId="date-preset-label"
            value={datePreset}
            label="Date Range"
            onChange={handlePresetChange}
          >
            <MenuItem value={DATE_PRESETS.THIS_WEEK}>This Week</MenuItem>
            <MenuItem value={DATE_PRESETS.LAST_WEEK}>Last Week</MenuItem>
            <MenuItem value={DATE_PRESETS.LAST_MONTH}>Last Month</MenuItem>
            <MenuItem value={DATE_PRESETS.CUSTOM}>Custom</MenuItem>
          </Select>
        </FormControl>

        {datePreset === DATE_PRESETS.CUSTOM && (
          <>
            <TextField
              label="Start Date"
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
              sx={{ minWidth: 140 }}
            />
            <TextField
              label="End Date"
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
              sx={{ minWidth: 140 }}
            />
          </>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ ml: isMobile ? 0 : 'auto' }}>
          {formatDateRangeDisplay()}
        </Typography>
      </Box>

      {/* History Table */}
      <TableContainer sx={{ maxHeight: 400 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell 
                sx={{ 
                  fontWeight: 'bold', 
                  minWidth: isMobile ? 80 : 120,
                  position: 'sticky',
                  left: 0,
                  backgroundColor: 'background.paper',
                  zIndex: 3
                }}
              >
                Name
              </TableCell>
              {dates.map((date, index) => {
                const { day, date: dayNum } = formatDateHeader(date);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                return (
                  <TableCell 
                    key={index}
                    sx={{ 
                      fontWeight: 'bold', 
                      textAlign: 'center',
                      minWidth: isMobile ? 30 : 40,
                      padding: isMobile ? '4px 2px' : '8px 4px',
                      backgroundColor: isWeekend ? 'grey.100' : 'background.paper'
                    }}
                  >
                    <Tooltip title={date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}>
                      <Box>
                        <Typography variant="caption" display="block" sx={{ fontSize: isMobile ? '0.6rem' : '0.7rem' }}>
                          {day}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 'bold', fontSize: isMobile ? '0.75rem' : '0.85rem' }}>
                          {dayNum}
                        </Typography>
                      </Box>
                    </Tooltip>
                  </TableCell>
                );
              })}
              <TableCell 
                sx={{ 
                  fontWeight: 'bold', 
                  textAlign: 'center',
                  minWidth: isMobile ? 40 : 50,
                  backgroundColor: 'primary.light',
                  color: 'primary.contrastText'
                }}
              >
                Total
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedStudents.map(student => (
              <TableRow key={student.id} hover>
                <TableCell 
                  sx={{ 
                    fontWeight: 500,
                    fontSize: isMobile ? '0.75rem' : '0.875rem',
                    position: 'sticky',
                    left: 0,
                    backgroundColor: 'background.paper',
                    zIndex: 1
                  }}
                >
                  {student.name}
                </TableCell>
                {dates.map((date, index) => {
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  return (
                    <React.Fragment key={index}>
                      {renderStatusCell(student, date)}
                    </React.Fragment>
                  );
                })}
                <TableCell 
                  sx={{ 
                    textAlign: 'center', 
                    fontWeight: 'bold',
                    backgroundColor: 'primary.light',
                    color: 'primary.contrastText',
                    fontSize: isMobile ? '0.8rem' : '0.9rem'
                  }}
                >
                  {getStudentTotalInRange(student)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Legend */}
      <Box sx={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: 2, 
        mt: 2,
        justifyContent: 'center',
        fontSize: '0.75rem'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 20, height: 20, backgroundColor: 'success.light', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'success.dark', fontWeight: 'bold', fontSize: '0.7rem' }}>✓</Box>
          <Typography variant="caption">Read</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 20, height: 20, backgroundColor: 'success.main', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.7rem' }}>2</Box>
          <Typography variant="caption">Multiple</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 20, height: 20, backgroundColor: 'warning.light', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'warning.dark', fontWeight: 'bold', fontSize: '0.7rem' }}>A</Box>
          <Typography variant="caption">Absent</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 20, height: 20, backgroundColor: 'grey.200', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'grey.600', fontWeight: 'bold', fontSize: '0.7rem' }}>•</Box>
          <Typography variant="caption">No Record</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 20, height: 20, backgroundColor: 'background.paper', border: '1px solid', borderColor: 'grey.300', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'grey.400', fontWeight: 'bold', fontSize: '0.7rem' }}>-</Box>
          <Typography variant="caption">Not Entered</Typography>
        </Box>
      </Box>
    </Paper>
  );
};

export default ClassReadingHistoryTable;