import React from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  Tooltip,
  InputAdornment,
  Collapse,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import BookAutocomplete from './BookAutocomplete';
import BookCover from '../BookCover';
import {
  READING_STATUS,
  DATE_PRESETS,
  formatDateISO,
  formatDateHeader,
  getStartOfWeek,
  getEndOfWeek,
} from './homeReadingUtils';

const FullReadingView = ({
  isMobile,
  selectedDate,
  onSelectedDateChange,
  selectedStudent,
  onSelectedStudentChange,
  searchQuery,
  onSearchChange,
  showInputPanel,
  onShowInputPanelChange,
  datePreset,
  onDatePresetChange,
  customStartDate,
  onCustomStartDateChange,
  customEndDate,
  onCustomEndDateChange,
  termDates,
  sessionsLoading,
  filteredStudents,
  dates,
  dailyTotals,
  getStudentReadingStatus,
  getStudentLastBook,
  getStudentTotalInRange,
  onRecordReading,
  onMultipleClick,
  onBookChange,
  onClearEntry,
  renderDateStatusCell,
  historyLoading,
  studentHistory,
  booksMap,
}) => {
  return (
    <>
      {/* Two-column layout for Recording and Date sections */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 2,
          mb: 2,
        }}
      >
        {/* Left Column - Input Panel (Recording for) */}
        <Paper sx={{ p: 2, flex: isMobile ? 'none' : 1 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: isMobile ? 'pointer' : 'default',
            }}
            onClick={() => isMobile && onShowInputPanelChange(!showInputPanel)}
          >
            <Typography variant="h6">
              {selectedStudent
                ? `Recording for: ${selectedStudent.name}`
                : 'Select a student from the register'}
            </Typography>
            {isMobile && (
              <IconButton size="small">
                {showInputPanel ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            )}
          </Box>

          <Collapse in={showInputPanel || !isMobile}>
            {selectedStudent ? (
              <Box sx={{ mt: 2 }}>
                {/* Book Selection */}
                <Box sx={{ mb: 2 }}>
                  <BookAutocomplete
                    value={getStudentLastBook(selectedStudent.id)}
                    onChange={onBookChange}
                    label="Current Book"
                    placeholder="Select or search for book..."
                  />
                  <Typography variant="caption" color="text.secondary">
                    Book will be saved and synced across devices
                  </Typography>
                </Box>

                {/* Quick Input Buttons */}
                <Box
                  sx={{
                    display: 'flex',
                    gap: 1,
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                  }}
                >
                  <Tooltip title="Read (✓)">
                    <Button
                      variant="contained"
                      color="success"
                      size="large"
                      aria-label="Mark as read"
                      onClick={() => onRecordReading(READING_STATUS.READ)}
                      sx={{ minWidth: 80, fontSize: '1.5rem', py: 1.5 }}
                    >
                      ✓
                    </Button>
                  </Tooltip>

                  <Tooltip title="Read 2 times">
                    <Button
                      variant="contained"
                      color="primary"
                      size="large"
                      aria-label="Read 2 times"
                      onClick={() => onRecordReading(READING_STATUS.MULTIPLE, 2)}
                      sx={{ minWidth: 50, fontSize: '1.2rem', py: 1.5 }}
                    >
                      2
                    </Button>
                  </Tooltip>

                  <Tooltip title="Read 3 times">
                    <Button
                      variant="contained"
                      color="primary"
                      size="large"
                      aria-label="Read 3 times"
                      onClick={() => onRecordReading(READING_STATUS.MULTIPLE, 3)}
                      sx={{ minWidth: 50, fontSize: '1.2rem', py: 1.5 }}
                    >
                      3
                    </Button>
                  </Tooltip>

                  <Tooltip title="Read 4 times">
                    <Button
                      variant="contained"
                      color="primary"
                      size="large"
                      aria-label="Read 4 times"
                      onClick={() => onRecordReading(READING_STATUS.MULTIPLE, 4)}
                      sx={{ minWidth: 50, fontSize: '1.2rem', py: 1.5 }}
                    >
                      4
                    </Button>
                  </Tooltip>

                  <Tooltip title="Custom number of sessions">
                    <Button
                      variant="contained"
                      color="primary"
                      size="large"
                      aria-label="Custom number of reading sessions"
                      onClick={onMultipleClick}
                      sx={{ minWidth: 50, fontSize: '1.2rem', py: 1.5 }}
                    >
                      +
                    </Button>
                  </Tooltip>

                  <Tooltip title="Absent (A)">
                    <Button
                      variant="contained"
                      color="warning"
                      size="large"
                      aria-label="Mark as absent"
                      onClick={() => onRecordReading(READING_STATUS.ABSENT)}
                      sx={{ minWidth: 80, fontSize: '1.5rem', py: 1.5 }}
                    >
                      A
                    </Button>
                  </Tooltip>

                  <Tooltip title="No Record (•)">
                    <Button
                      variant="outlined"
                      color="inherit"
                      size="large"
                      aria-label="No reading record"
                      onClick={() => onRecordReading(READING_STATUS.NO_RECORD)}
                      sx={{ minWidth: 80, fontSize: '1.5rem', py: 1.5 }}
                    >
                      •
                    </Button>
                  </Tooltip>
                </Box>
              </Box>
            ) : (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 2, textAlign: 'center' }}
              >
                Click on a student in the register below to record their reading
              </Typography>
            )}
          </Collapse>
        </Paper>

        {/* Right Column - Date and Search Controls */}
        <Paper sx={{ p: 2, flex: isMobile ? 'none' : 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
            {/* Date Picker */}
            <TextField
              label="Date"
              type="date"
              value={selectedDate}
              onChange={(e) => onSelectedDateChange(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
              inputProps={{ 'aria-label': 'Select date for reading session' }}
            />

            {/* Date Range Preset */}
            <FormControl data-tour="register-date-range" size="small" fullWidth>
              <InputLabel id="date-preset-label">Date Range</InputLabel>
              <Select
                labelId="date-preset-label"
                value={datePreset}
                label="Date Range"
                onChange={(e) => {
                  const newPreset = e.target.value;
                  onDatePresetChange(newPreset);
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

            {datePreset === DATE_PRESETS.CUSTOM && (
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
      </Box>

      {/* Register Table */}
      <Paper sx={{ mb: 2, position: 'relative' }}>
        {sessionsLoading && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.7)',
              zIndex: 10,
            }}
          >
            <CircularProgress size={40} />
          </Box>
        )}
        <TableContainer
          data-tour="register-table"
          sx={{ maxHeight: { xs: 'calc(100vh - 340px)', sm: 'calc(100vh - 260px)' } }}
        >
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell
                  sx={{
                    fontWeight: 'bold',
                    minWidth: isMobile ? 100 : 140,
                    padding: isMobile ? '8px 6px' : '6px 8px',
                    position: 'sticky',
                    left: 0,
                    backgroundColor: 'background.paper',
                    zIndex: 3,
                  }}
                >
                  Name
                </TableCell>
                {dates.map((date, index) => {
                  const { day, date: dayNum } = formatDateHeader(date);
                  const dateStr = formatDateISO(date);
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  const isSelectedDate = selectedDate === dateStr;
                  return (
                    <TableCell
                      key={index}
                      sx={{
                        fontWeight: 'bold',
                        textAlign: 'center',
                        minWidth: isMobile ? 44 : 48,
                        padding: isMobile ? '8px 4px' : '6px 6px',
                        backgroundColor: isSelectedDate
                          ? 'primary.main'
                          : isWeekend
                            ? 'grey.100'
                            : 'background.paper',
                        color: isSelectedDate ? 'primary.contrastText' : 'text.primary',
                        cursor: 'pointer',
                        '@media (hover: hover) and (pointer: fine)': {
                          '&:hover': {
                            backgroundColor: isSelectedDate ? 'primary.dark' : 'action.hover',
                          },
                        },
                        transition: 'background-color 0.2s ease-in-out',
                      }}
                      onClick={() => onSelectedDateChange(dateStr)}
                    >
                      <Tooltip
                        title={date.toLocaleDateString('en-GB', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'short',
                        })}
                      >
                        <Box>
                          <Typography
                            variant="caption"
                            display="block"
                            sx={{ fontSize: isMobile ? '0.7rem' : '0.75rem' }}
                          >
                            {day}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 'bold',
                              fontSize: isMobile ? '0.8rem' : '0.85rem',
                            }}
                          >
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
                    minWidth: 44,
                    padding: isMobile ? '8px 4px' : '6px 6px',
                    backgroundColor: 'primary.light',
                    color: 'primary.contrastText',
                  }}
                >
                  Total
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 'bold',
                    textAlign: 'center',
                    minWidth: 44,
                    padding: isMobile ? '8px 4px' : '6px 6px',
                  }}
                >
                  Clear
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredStudents.map((student) => {
                const isSelected = selectedStudent?.id === student.id;
                const { status } = getStudentReadingStatus(student, selectedDate);
                const hasEntry = status !== READING_STATUS.NONE;

                return (
                  <TableRow
                    key={student.id}
                    hover
                    selected={isSelected}
                    onClick={() => onSelectedStudentChange(student)}
                    sx={{
                      cursor: 'pointer',
                      '&.Mui-selected': { backgroundColor: 'primary.light' },
                    }}
                  >
                    <TableCell
                      sx={{
                        fontWeight: isSelected ? 'bold' : 500,
                        fontSize: isMobile ? '0.8rem' : '0.85rem',
                        padding: isMobile ? '10px 6px' : '8px 8px',
                        position: 'sticky',
                        left: 0,
                        backgroundColor: isSelected ? 'primary.light' : 'background.paper',
                        zIndex: 1,
                      }}
                    >
                      {student.name}
                    </TableCell>
                    {dates.map((date) => renderDateStatusCell(student, date))}
                    <TableCell
                      sx={{
                        textAlign: 'center',
                        fontWeight: 'bold',
                        backgroundColor: 'primary.light',
                        color: 'primary.contrastText',
                        fontSize: isMobile ? '0.85rem' : '0.9rem',
                        padding: isMobile ? '10px 4px' : '8px 6px',
                      }}
                    >
                      {getStudentTotalInRange(student)}
                    </TableCell>
                    <TableCell
                      sx={{ textAlign: 'center', padding: isMobile ? '6px 4px' : '4px 4px' }}
                    >
                      {hasEntry && (
                        <Tooltip title="Clear entry">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              onClearEntry(student);
                            }}
                            sx={{
                              color: 'error.main',
                              minWidth: 36,
                              minHeight: 36,
                              padding: '4px',
                              '@media (hover: hover) and (pointer: fine)': {
                                '&:hover': { backgroundColor: 'error.light' },
                              },
                              '&:active': { backgroundColor: 'rgba(193, 126, 126, 0.2)' },
                            }}
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredStudents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={dates.length + 3} sx={{ textAlign: 'center', py: 4 }}>
                    <Typography color="text.secondary">
                      {searchQuery ? 'No students match your search' : 'No students in this class'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {filteredStudents.length > 0 && (
                <TableRow data-tour="register-totals" sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell
                    sx={{
                      fontWeight: 'bold',
                      position: 'sticky',
                      left: 0,
                      backgroundColor: 'grey.50',
                      zIndex: 3,
                      borderTop: '2px solid',
                      borderColor: 'grey.300',
                      padding: isMobile ? '8px 6px' : '6px 8px',
                      fontSize: isMobile ? '0.8rem' : '0.85rem',
                    }}
                  >
                    Daily Totals
                  </TableCell>
                  {dailyTotals.map((totals, index) => {
                    const isWeekend = dates[index].getDay() === 0 || dates[index].getDay() === 6;
                    return (
                      <TableCell
                        key={index}
                        sx={{
                          textAlign: 'center',
                          fontWeight: 'bold',
                          padding: isMobile ? '8px 4px' : '6px 6px',
                          backgroundColor: isWeekend ? 'grey.100' : 'grey.50',
                          borderTop: '2px solid',
                          borderColor: 'grey.300',
                          fontSize: isMobile ? '0.75rem' : '0.8rem',
                        }}
                      >
                        {totals.totalSessions > 0 && (
                          <Tooltip
                            title={`${totals.read} read, ${totals.multiple} multiple, ${totals.absent} absent, ${totals.noRecord} no record, ${totals.notEntered} not entered`}
                          >
                            <Box>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 'bold', color: 'success.main' }}
                              >
                                {totals.totalSessions}
                              </Typography>
                              {totals.read > 0 && (
                                <Typography
                                  variant="caption"
                                  sx={{ color: 'success.dark', fontSize: '0.7rem' }}
                                >
                                  {totals.read}✓
                                </Typography>
                              )}
                              {totals.multiple > 0 && (
                                <Typography
                                  variant="caption"
                                  sx={{ color: 'success.dark', fontSize: '0.7rem' }}
                                >
                                  +{totals.multiple}
                                </Typography>
                              )}
                            </Box>
                          </Tooltip>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell
                    sx={{
                      textAlign: 'center',
                      fontWeight: 'bold',
                      backgroundColor: 'primary.light',
                      color: 'primary.contrastText',
                      borderTop: '2px solid',
                      borderColor: 'grey.300',
                      padding: isMobile ? '4px 2px' : '2px 4px',
                      fontSize: isMobile ? '0.8rem' : '0.85rem',
                    }}
                  >
                    {dailyTotals.reduce((sum, day) => sum + day.totalSessions, 0)}
                  </TableCell>
                  <TableCell
                    sx={{
                      borderTop: '2px solid',
                      borderColor: 'grey.300',
                      backgroundColor: 'grey.50',
                    }}
                  />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Student Books Read */}
      {selectedStudent && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
            Books Read — {selectedStudent.name}
          </Typography>
          {historyLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          ) : studentHistory.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              No reading sessions recorded yet
            </Typography>
          ) : (
            (() => {
              // Group sessions by bookId, ordered by most recent session
              const bookGroups = new Map();
              for (const session of studentHistory) {
                const key = session.bookId || `no-book-${session.id}`;
                if (!bookGroups.has(key)) {
                  bookGroups.set(key, { bookId: session.bookId, sessions: [] });
                }
                bookGroups.get(key).sessions.push(session);
              }
              const booksRead = [...bookGroups.values()]
                .filter((g) => g.bookId) // exclude sessions with no book
                .map((g) => ({
                  ...g,
                  lastDate: g.sessions[0].date, // already sorted newest-first
                  firstDate: g.sessions[g.sessions.length - 1].date,
                  count: g.sessions.length,
                }));
              if (booksRead.length === 0)
                return (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ textAlign: 'center', py: 2 }}
                  >
                    No books recorded yet
                  </Typography>
                );
              return (
                <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
                  {booksRead.slice(0, 30).map((entry) => {
                    const book = booksMap.get(entry.bookId);
                    const lastDate = new Date(entry.lastDate);
                    const dateLabel = lastDate.toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    });
                    return (
                      <Box
                        key={entry.bookId}
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          minWidth: 90,
                          maxWidth: 90,
                          flexShrink: 0,
                        }}
                      >
                        <BookCover
                          title={book?.title || 'Unknown'}
                          author={book?.author}
                          width={70}
                          height={100}
                        />
                        <Typography
                          variant="caption"
                          sx={{
                            mt: 0.5,
                            fontWeight: 600,
                            textAlign: 'center',
                            lineHeight: 1.2,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            fontSize: '0.7rem',
                            width: '100%',
                          }}
                        >
                          {book?.title || 'Unknown'}
                        </Typography>
                        {book?.author && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontSize: '0.6rem', textAlign: 'center', lineHeight: 1.1 }}
                            noWrap
                          >
                            {book.author}
                          </Typography>
                        )}
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: '0.6rem' }}
                        >
                          {entry.count} {entry.count === 1 ? 'session' : 'sessions'}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: '0.6rem' }}
                        >
                          {dateLabel}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              );
            })()
          )}
        </Paper>
      )}
    </>
  );
};

export default FullReadingView;
