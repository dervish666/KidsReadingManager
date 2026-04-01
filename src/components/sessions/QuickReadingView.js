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
  InputAdornment,
  CircularProgress,
  ClickAwayListener,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import BookAutocomplete from './BookAutocomplete';
import { READING_STATUS, formatDateISO, formatDateHeader } from './homeReadingUtils';

const QuickReadingView = ({
  selectedDate,
  onSelectedDateChange,
  searchQuery,
  onSearchChange,
  filteredStudents,
  sessionsLoading,
  previousDays,
  getStudentReadingStatus,
  getStudentLastBook,
  recordingStudents,
  editingBookStudentId,
  onEditBookStudent,
  onQuickRecord,
  onClearEntry,
  onQuickMultipleStudent,
  onMultipleCountDialogOpen,
  updateStudentCurrentBook,
}) => {
  return (
    <>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label="Date"
          type="date"
          value={selectedDate}
          onChange={(e) => onSelectedDateChange(e.target.value)}
          InputLabelProps={{ shrink: true }}
          size="small"
          sx={{ width: 180 }}
          inputProps={{ 'aria-label': 'Select date for reading session' }}
        />
        <TextField
          placeholder="Search student..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          size="small"
          sx={{ flex: 1, minWidth: 150 }}
          inputProps={{ 'aria-label': 'Search for a student by name' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <Typography variant="body2" color="text.secondary">
          {filteredStudents.length} students
        </Typography>
      </Box>

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
        <TableContainer sx={{ maxHeight: 'calc(100vh - 260px)' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                {previousDays.map((date, i) => {
                  const { day, date: dayNum } = formatDateHeader(date);
                  return (
                    <TableCell
                      key={formatDateISO(date)}
                      {...(i === 0 ? { 'data-tour': 'quick-history' } : {})}
                      sx={{
                        fontWeight: 'bold',
                        textAlign: 'center',
                        padding: '4px',
                        minWidth: 40,
                        maxWidth: 48,
                      }}
                    >
                      <Typography
                        variant="caption"
                        display="block"
                        sx={{ fontSize: '0.7rem', lineHeight: 1.2, color: 'text.secondary' }}
                      >
                        {day}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 'bold', fontSize: '0.8rem' }}
                      >
                        {dayNum}
                      </Typography>
                    </TableCell>
                  );
                })}
                <TableCell sx={{ fontWeight: 'bold', padding: '6px 8px' }}>Student</TableCell>
                <TableCell
                  sx={{
                    fontWeight: 'bold',
                    padding: '6px 8px',
                  }}
                >
                  Record Reading
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold', padding: '6px 8px' }}>Book</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredStudents.map((student, studentIdx) => {
                const { status, count } = getStudentReadingStatus(student, selectedDate);
                const book = getStudentLastBook(student.id);
                const isRecording = recordingStudents.has(student.id);
                const hasEntry = status !== READING_STATUS.NONE;
                const isFirstRow = studentIdx === 0;

                const btnSx = { minWidth: 36, minHeight: 36, px: 0.5, borderRadius: 1.5 };
                const numBtnSx = { ...btnSx, minWidth: 32, fontSize: '0.9rem' };

                return (
                  <TableRow key={student.id} hover>
                    {previousDays.map((date) => {
                      const dateStr = formatDateISO(date);
                      const prevStatus = getStudentReadingStatus(student, dateStr);
                      let content = '-';
                      let cellColor = 'grey.400';
                      let bgColor = 'transparent';
                      switch (prevStatus.status) {
                        case READING_STATUS.READ:
                          content = '✓';
                          cellColor = 'success.dark';
                          bgColor = 'rgba(46, 125, 50, 0.1)';
                          break;
                        case READING_STATUS.MULTIPLE:
                          content = prevStatus.count;
                          cellColor = 'success.dark';
                          bgColor = 'rgba(46, 125, 50, 0.15)';
                          break;
                        case READING_STATUS.ABSENT:
                          content = 'A';
                          cellColor = 'warning.dark';
                          bgColor = 'rgba(237, 108, 2, 0.1)';
                          break;
                        case READING_STATUS.NO_RECORD:
                          content = '•';
                          cellColor = 'grey.500';
                          bgColor = 'grey.100';
                          break;
                        default:
                          break;
                      }
                      return (
                        <TableCell
                          key={dateStr}
                          sx={{
                            textAlign: 'center',
                            padding: '4px',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            backgroundColor: bgColor,
                            color: cellColor,
                            minWidth: 36,
                            maxWidth: 44,
                          }}
                        >
                          {content}
                        </TableCell>
                      );
                    })}
                    <TableCell
                      sx={{
                        fontWeight: 500,
                        fontSize: '0.9rem',
                        whiteSpace: 'nowrap',
                        padding: '4px 8px',
                        borderRight: '1px solid',
                        borderRightColor: 'divider',
                      }}
                    >
                      {student.name}
                    </TableCell>
                    <TableCell
                      {...(isFirstRow ? { 'data-tour': 'quick-buttons' } : {})}
                      sx={{ padding: '4px 8px' }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          gap: 0.5,
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                        }}
                      >
                        <Button
                          size="small"
                          variant={status === READING_STATUS.READ ? 'contained' : 'outlined'}
                          color="success"
                          disabled={isRecording}
                          onClick={() => onQuickRecord(student, READING_STATUS.READ)}
                          sx={{ ...btnSx, fontSize: '1.1rem' }}
                          aria-label={`Mark ${student.name} as read`}
                        >
                          ✓
                        </Button>
                        {[2, 3, 4].map((n) => (
                          <Button
                            key={n}
                            size="small"
                            variant={
                              status === READING_STATUS.MULTIPLE &&
                              (n < 4 ? count === n : count >= 4)
                                ? 'contained'
                                : 'outlined'
                            }
                            color="primary"
                            disabled={isRecording}
                            onClick={() =>
                              onQuickRecord(student, READING_STATUS.MULTIPLE, n)
                            }
                            sx={numBtnSx}
                            aria-label={`Mark ${student.name} as read ${n} times`}
                          >
                            {n < 4
                              ? n
                              : status === READING_STATUS.MULTIPLE && count >= 4
                                ? count
                                : '4'}
                          </Button>
                        ))}
                        <Button
                          size="small"
                          variant="outlined"
                          color="primary"
                          disabled={isRecording}
                          onClick={() => {
                            onQuickMultipleStudent(student);
                            onMultipleCountDialogOpen();
                          }}
                          sx={numBtnSx}
                          aria-label={`Custom reading count for ${student.name}`}
                        >
                          +
                        </Button>
                        <Button
                          size="small"
                          variant={status === READING_STATUS.ABSENT ? 'contained' : 'outlined'}
                          color="warning"
                          disabled={isRecording}
                          onClick={() => onQuickRecord(student, READING_STATUS.ABSENT)}
                          sx={numBtnSx}
                          aria-label={`Mark ${student.name} as absent`}
                        >
                          A
                        </Button>
                        <Button
                          size="small"
                          variant={
                            status === READING_STATUS.NO_RECORD ? 'contained' : 'outlined'
                          }
                          disabled={isRecording}
                          onClick={() => onQuickRecord(student, READING_STATUS.NO_RECORD)}
                          sx={{
                            ...numBtnSx,
                            color: status === READING_STATUS.NO_RECORD ? undefined : 'grey.500',
                          }}
                          aria-label={`Mark ${student.name} as no record`}
                        >
                          •
                        </Button>
                        {hasEntry && (
                          <IconButton
                            size="small"
                            disabled={isRecording}
                            onClick={() => onClearEntry(student)}
                            sx={{ color: 'error.main', ml: 0.25 }}
                            aria-label={`Clear entry for ${student.name}`}
                          >
                            <CloseIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        )}
                        {isRecording && <CircularProgress size={16} sx={{ ml: 0.5 }} />}
                      </Box>
                    </TableCell>
                    <TableCell
                      {...(isFirstRow ? { 'data-tour': 'quick-book' } : {})}
                      onClick={() => onEditBookStudent(student.id)}
                      sx={{
                        color: book ? 'text.secondary' : 'text.disabled',
                        fontSize: '0.85rem',
                        minWidth: editingBookStudentId === student.id ? 250 : 120,
                        maxWidth: editingBookStudentId === student.id ? 350 : 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        padding: '4px 8px',
                        cursor: 'pointer',
                      }}
                    >
                      {editingBookStudentId === student.id ? (
                        <ClickAwayListener onClickAway={() => onEditBookStudent(null)}>
                          <Box onClick={(e) => e.stopPropagation()}>
                            <BookAutocomplete
                              value={book}
                              onChange={(newBook) => {
                                updateStudentCurrentBook(
                                  student.id,
                                  newBook?.id || null,
                                  newBook?.title || null,
                                  newBook?.author || null
                                );
                                onEditBookStudent(null);
                              }}
                              label=""
                              placeholder="Search for book..."
                            />
                          </Box>
                        </ClickAwayListener>
                      ) : (
                        book?.title || 'Tap to set book'
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredStudents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4 }}>
                    <Typography color="text.secondary">
                      {searchQuery
                        ? 'No students match your search'
                        : 'No students in this class'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </>
  );
};

export default QuickReadingView;
