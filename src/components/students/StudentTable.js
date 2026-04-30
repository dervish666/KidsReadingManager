import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Box,
  Tooltip,
  Typography,
  TableSortLabel,
  Snackbar,
  Alert,
} from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import CheckIcon from '@mui/icons-material/Check';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';
import StreakBadge from './StreakBadge';
import { useTheme } from '@mui/material/styles';
import StudentDetailDrawer from './StudentDetailDrawer';
import { STATUS_TO_PALETTE } from '../../utils/helpers';

const StudentTable = React.memo(({ students }) => {
  const theme = useTheme();
  const { classes } = useData();
  const { getReadingStatus, markStudentAsPriorityHandled, markedPriorityStudentIds } = useUI();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [orderBy, setOrderBy] = useState('name');
  const [order, setOrder] = useState('asc');
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });
  const [markedStudentId, setMarkedStudentId] = useState(null);
  const markedStudentTimerRef = useRef(null);

  // Clean up the animation timeout on unmount to prevent state updates on unmounted component
  useEffect(() => {
    return () => {
      if (markedStudentTimerRef.current) {
        clearTimeout(markedStudentTimerRef.current);
      }
    };
  }, []);

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Pre-compute per-student derived data to avoid repeated lookups
  const studentDerivedData = useMemo(() => {
    const map = new Map();
    for (const student of students) {
      const mostRecentReadDate = student?.lastReadDate || null;

      let daysSince = 'Never read';
      if (mostRecentReadDate) {
        const diffTime = Math.max(0, new Date() - new Date(mostRecentReadDate));
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        daysSince = `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
      }

      let className = 'Unassigned';
      if (student?.classId && classes?.length > 0) {
        const found = classes.find((c) => c.id === student.classId);
        className = found ? found.name : 'Unknown';
      }

      map.set(student.id, { mostRecentReadDate, daysSince, className });
    }
    return map;
  }, [students, classes]);

  const getDaysSince = (student) => studentDerivedData.get(student.id)?.daysSince || 'Never read';
  const getClassName = useCallback(
    (student) => studentDerivedData.get(student.id)?.className || 'Unassigned',
    [studentDerivedData]
  );
  const getMostRecentReadDate = useCallback(
    (student) => studentDerivedData.get(student.id)?.mostRecentReadDate || null,
    [studentDerivedData]
  );

  const handleRowClick = (student) => {
    setSelectedStudent(student);
    setDrawerOpen(true);
  };

  const handleIconClick = (e, student) => {
    e.stopPropagation();
    if (markStudentAsPriorityHandled) {
      markStudentAsPriorityHandled(student.id);
      setMarkedStudentId(student.id);
      setSnackbar({
        open: true,
        message: `${student.name} added to reading list`,
      });
      // Clear the checkmark animation after a delay
      if (markedStudentTimerRef.current) {
        clearTimeout(markedStudentTimerRef.current);
      }
      markedStudentTimerRef.current = setTimeout(() => setMarkedStudentId(null), 1500);
    }
  };

  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const sortedStudents = useMemo(() => {
    const comparator = (a, b) => {
      let aValue, bValue;

      switch (orderBy) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'class':
          aValue = getClassName(a).toLowerCase();
          bValue = getClassName(b).toLowerCase();
          break;
        case 'lastRead':
          aValue = getMostRecentReadDate(a) || '';
          bValue = getMostRecentReadDate(b) || '';
          // Convert to timestamps for comparison
          aValue = aValue ? new Date(aValue).getTime() : 0;
          bValue = bValue ? new Date(bValue).getTime() : 0;
          break;
        case 'sessions':
          aValue = a.totalSessionCount || 0;
          bValue = b.totalSessionCount || 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) {
        return order === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return order === 'asc' ? 1 : -1;
      }
      return 0;
    };

    return [...students].sort(comparator);
  }, [students, orderBy, order, getClassName, getMostRecentReadDate]);

  return (
    <>
      <TableContainer
        component={Paper}
        sx={{
          borderRadius: 0,
          boxShadow: 1,
          '& .MuiTableCell-root': {
            // Touch-friendly padding
            py: { xs: 2, sm: 1.5 },
            px: { xs: 1.5, sm: 2 },
          },
        }}
      >
        <Table sx={{ minWidth: { xs: 300, sm: 650 } }}>
          <TableHead>
            <TableRow sx={{ bgcolor: 'primary.main' }}>
              <TableCell sx={{ color: 'white', fontWeight: 600, width: { xs: '30%', sm: '25%' } }}>
                <TableSortLabel
                  active={orderBy === 'name'}
                  direction={orderBy === 'name' ? order : 'asc'}
                  onClick={() => handleRequestSort('name')}
                  aria-label={`Sort by student name, currently ${orderBy === 'name' ? (order === 'asc' ? 'ascending' : 'descending') : 'unsorted'}`}
                  sx={{
                    color: 'white !important',
                    '&:hover': { color: 'white !important' },
                    '& .MuiTableSortLabel-icon': { color: 'white !important' },
                    '&.Mui-active': { color: 'white !important' },
                    '&.Mui-active .MuiTableSortLabel-icon': { color: 'white !important' },
                  }}
                >
                  Student
                </TableSortLabel>
              </TableCell>
              <TableCell
                sx={{ color: 'white', fontWeight: 600, display: { xs: 'none', sm: 'table-cell' } }}
              >
                <TableSortLabel
                  active={orderBy === 'class'}
                  direction={orderBy === 'class' ? order : 'asc'}
                  onClick={() => handleRequestSort('class')}
                  aria-label={`Sort by class, currently ${orderBy === 'class' ? (order === 'asc' ? 'ascending' : 'descending') : 'unsorted'}`}
                  sx={{
                    color: 'white !important',
                    '&:hover': { color: 'white !important' },
                    '& .MuiTableSortLabel-icon': { color: 'white !important' },
                    '&.Mui-active': { color: 'white !important' },
                    '&.Mui-active .MuiTableSortLabel-icon': { color: 'white !important' },
                  }}
                >
                  Class
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 600 }}>
                <TableSortLabel
                  active={orderBy === 'lastRead'}
                  direction={orderBy === 'lastRead' ? order : 'asc'}
                  onClick={() => handleRequestSort('lastRead')}
                  aria-label={`Sort by last read date, currently ${orderBy === 'lastRead' ? (order === 'asc' ? 'ascending' : 'descending') : 'unsorted'}`}
                  sx={{
                    color: 'white !important',
                    '&:hover': { color: 'white !important' },
                    '& .MuiTableSortLabel-icon': { color: 'white !important' },
                    '&.Mui-active': { color: 'white !important' },
                    '&.Mui-active .MuiTableSortLabel-icon': { color: 'white !important' },
                  }}
                >
                  Last Read
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 600, textAlign: 'center' }}>
                <TableSortLabel
                  active={orderBy === 'sessions'}
                  direction={orderBy === 'sessions' ? order : 'asc'}
                  onClick={() => handleRequestSort('sessions')}
                  aria-label={`Sort by number of reading sessions, currently ${orderBy === 'sessions' ? (order === 'asc' ? 'ascending' : 'descending') : 'unsorted'}`}
                  sx={{
                    color: 'white !important',
                    '&:hover': { color: 'white !important' },
                    '& .MuiTableSortLabel-icon': { color: 'white !important' },
                    '&.Mui-active': { color: 'white !important' },
                    '&.Mui-active .MuiTableSortLabel-icon': { color: 'white !important' },
                  }}
                >
                  Sessions
                </TableSortLabel>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedStudents.map((student, index) => {
              const status = getReadingStatus(student);
              const paletteKey = STATUS_TO_PALETTE[status] || 'notRead';
              const statusColor = theme.palette.status?.[paletteKey] || theme.palette.primary.main;
              const mostRecentReadDate = getMostRecentReadDate(student);

              return (
                <TableRow
                  key={student.id}
                  data-tour={index === 0 ? 'students-row' : undefined}
                  onClick={() => handleRowClick(student)}
                  sx={{
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease',
                    '&:hover': {
                      bgcolor: 'action.hover',
                    },
                    // Touch-friendly row height
                    height: { xs: 72, sm: 60 },
                    // Skip rendering for off-screen rows (browser-native virtualization)
                    contentVisibility: 'auto',
                    containIntrinsicBlockSize: { xs: '72px', sm: '60px' },
                    // Add border-left for status indicator
                    borderLeft: `4px solid ${statusColor}`,
                  }}
                  tabIndex={0}
                  role="row"
                  aria-label={`${student.name}, status: ${{ recent: 'Recently read', attention: 'Needs attention', never: 'Not read', overdue: 'Overdue' }[status] || status}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRowClick(student);
                    }
                  }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      {(() => {
                        const isMarkedForToday = markedPriorityStudentIds?.has(student.id);
                        const isJustClicked = markedStudentId === student.id;
                        const showGreen = isMarkedForToday || isJustClicked;

                        return (
                          <Tooltip
                            title={isMarkedForToday ? 'Reading today ✓' : 'Reading today'}
                            arrow
                            placement="top"
                          >
                            <Box
                              onClick={(e) => handleIconClick(e, student)}
                              role="button"
                              tabIndex={0}
                              aria-label={
                                isMarkedForToday
                                  ? `${student.name} marked as reading today`
                                  : `Mark ${student.name} as reading today`
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleIconClick(e, student);
                                }
                              }}
                              sx={{
                                bgcolor: showGreen ? 'success.main' : 'primary.main',
                                color: 'white',
                                width: { xs: 36, sm: 40 },
                                height: { xs: 36, sm: 40 },
                                borderRadius: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                boxShadow: showGreen ? 2 : 1,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease-in-out',
                                '&:hover': {
                                  transform: 'scale(1.1)',
                                  bgcolor: showGreen ? 'success.dark' : 'primary.dark',
                                },
                                '&:active': {
                                  transform: 'scale(0.95)',
                                },
                              }}
                            >
                              {isJustClicked ? (
                                <CheckIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />
                              ) : (
                                <MenuBookIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />
                              )}
                            </Box>
                          </Tooltip>
                        );
                      })()}
                      <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography
                            variant="body1"
                            sx={{
                              fontWeight: 600,
                              fontSize: { xs: '0.95rem', sm: '1rem' },
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {student.name} ({student.totalSessionCount || 0})
                          </Typography>
                          {student.currentStreak > 0 && (
                            <StreakBadge streak={student.currentStreak} size="small" />
                          )}
                        </Box>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            fontSize: { xs: '0.75rem', sm: '0.875rem' },
                            display: { xs: 'block', sm: 'none' },
                          }}
                        >
                          {getClassName(student)}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    <Typography variant="body2" color="text.secondary">
                      {getClassName(student)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Chip
                        label={formatDate(mostRecentReadDate)}
                        size="small"
                        color={
                          paletteKey === 'notRead'
                            ? 'error'
                            : paletteKey === 'needsAttention'
                              ? 'warning'
                              : 'success'
                        }
                        sx={{
                          height: { xs: 26, sm: 24 },
                          fontSize: { xs: '0.75rem', sm: '0.7rem' },
                          fontWeight: 500,
                          alignSelf: 'flex-start',
                        }}
                      />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          fontStyle: 'italic',
                          fontSize: { xs: '0.7rem', sm: '0.65rem' },
                        }}
                      >
                        {getDaysSince(student)}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={student.totalSessionCount || 0}
                      size="small"
                      color={(student.totalSessionCount || 0) === 0 ? 'default' : 'primary'}
                      sx={{
                        height: { xs: 26, sm: 24 },
                        fontSize: { xs: '0.75rem', sm: '0.7rem' },
                        fontWeight: 600,
                        minWidth: { xs: 40, sm: 36 },
                      }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <StudentDetailDrawer
        open={drawerOpen}
        student={selectedStudent}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedStudent(null);
        }}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={2000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity="success"
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
});

export default StudentTable;
