import React from 'react';
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
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ReadingInputPanel from './ReadingInputPanel';
import DateRangePanel from './DateRangePanel';
import StudentBooksRead from './StudentBooksRead';
import { READING_STATUS, formatDateISO, formatDateHeader } from './homeReadingUtils';

/**
 * Full register view for home reading: a two-column control area
 * (ReadingInputPanel + DateRangePanel), the multi-day register table with
 * daily totals, and the selected student's books-read history
 * (StudentBooksRead).
 *
 * Related props are grouped into objects to keep the interface small:
 *
 * @param {object} props
 * @param {boolean} props.isMobile - Mobile breakpoint flag
 * @param {string} props.selectedDate - ISO date for the active register day
 * @param {Function} props.onSelectedDateChange - Sets the active register day
 * @param {object|null} props.selectedStudent - Currently selected student
 * @param {Function} props.onSelectedStudentChange - Sets the selected student
 * @param {string} props.searchQuery - Student name filter text
 * @param {Function} props.onSearchChange - Sets the student name filter
 * @param {object} props.dateRange - Date range preset controls (see DateRangePanel)
 * @param {object} props.inputPanel - Recording panel state and handlers:
 *   { show, onShowChange, getStudentLastBook, onBookChange, onRecordReading,
 *     onMultipleClick, isRecording }
 * @param {object} props.register - Register table data and handlers:
 *   { sessionsLoading, filteredStudents, dates, dailyTotals,
 *     getStudentReadingStatus, getStudentTotalInRange, onClearEntry,
 *     renderDateStatusCell }
 * @param {object} props.bookHistory - Selected student's reading history:
 *   { loading, sessions, booksMap }
 */
const FullReadingView = ({
  isMobile,
  selectedDate,
  onSelectedDateChange,
  selectedStudent,
  onSelectedStudentChange,
  searchQuery,
  onSearchChange,
  dateRange,
  inputPanel,
  register,
  bookHistory,
}) => {
  const {
    sessionsLoading,
    filteredStudents,
    dates,
    dailyTotals,
    getStudentReadingStatus,
    getStudentTotalInRange,
    onClearEntry,
    renderDateStatusCell,
  } = register;

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
        <ReadingInputPanel
          isMobile={isMobile}
          selectedStudent={selectedStudent}
          showInputPanel={inputPanel.show}
          onShowInputPanelChange={inputPanel.onShowChange}
          getStudentLastBook={inputPanel.getStudentLastBook}
          onBookChange={inputPanel.onBookChange}
          onRecordReading={inputPanel.onRecordReading}
          onMultipleClick={inputPanel.onMultipleClick}
          isRecording={inputPanel.isRecording}
        />

        {/* Right Column - Date and Search Controls */}
        <DateRangePanel
          isMobile={isMobile}
          selectedDate={selectedDate}
          onSelectedDateChange={onSelectedDateChange}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          dateRange={dateRange}
        />
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
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow data-tour="register-table">
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
                  const prevDate = index > 0 ? dates[index - 1] : null;
                  const isMonthBoundary = !prevDate || prevDate.getMonth() !== date.getMonth();
                  const monthLabel = isMonthBoundary
                    ? date.toLocaleDateString('en-GB', { month: 'short' })
                    : '';
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
                            sx={{
                              fontSize: isMobile ? '0.6rem' : '0.65rem',
                              fontWeight: 700,
                              color: isSelectedDate ? 'primary.contrastText' : 'primary.main',
                              lineHeight: 1.1,
                              minHeight: '0.9em',
                              textTransform: 'uppercase',
                              letterSpacing: '0.03em',
                            }}
                          >
                            {monthLabel || '\u00A0'}
                          </Typography>
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
                    const totalStudents =
                      totals.read +
                      totals.multiple +
                      totals.absent +
                      totals.noRecord +
                      totals.notEntered;
                    const readPercent =
                      totalStudents > 0
                        ? Math.round(((totals.read + totals.multiple) / totalStudents) * 100)
                        : null;
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
                        <Tooltip
                          title={`${totals.read} read, ${totals.multiple} multiple, ${totals.absent} absent, ${totals.noRecord} no record, ${totals.notEntered} not entered`}
                        >
                          <Box>
                            {totals.totalSessions > 0 && (
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 'bold', color: 'success.main' }}
                              >
                                {totals.totalSessions}
                              </Typography>
                            )}
                            {readPercent !== null && (
                              <Typography
                                variant="caption"
                                sx={{ fontSize: '0.7rem', color: 'text.secondary' }}
                              >
                                {readPercent}%
                              </Typography>
                            )}
                          </Box>
                        </Tooltip>
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
        <StudentBooksRead
          selectedStudent={selectedStudent}
          loading={bookHistory.loading}
          sessions={bookHistory.sessions}
          booksMap={bookHistory.booksMap}
        />
      )}
    </>
  );
};

export default FullReadingView;
