import React, { useState, useMemo } from 'react';
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
  IconButton,
  Tooltip,
  Typography,
  TableSortLabel
} from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { useAppContext } from '../../contexts/AppContext';
import { useTheme } from '@mui/material/styles';
import StudentSessions from '../sessions/StudentSessions';
import ReadingPreferences from './ReadingPreferences';

const StudentTable = ({ students }) => {
  const theme = useTheme();
  const { getReadingStatus, classes, markStudentAsPriorityHandled } = useAppContext();
  const [openSessionsDialog, setOpenSessionsDialog] = useState(false);
  const [openPreferencesDialog, setOpenPreferencesDialog] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [orderBy, setOrderBy] = useState('name');
  const [order, setOrder] = useState('asc');

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getDaysSince = (student) => {
    const mostRecentReadDate = student?.readingSessions?.length > 0
      ? [...student.readingSessions].sort((a, b) => new Date(b.date) - new Date(a.date))[0].date
      : student?.lastReadDate;
    
    if (!mostRecentReadDate) return 'Never read';
    const diffTime = Math.max(0, new Date() - new Date(mostRecentReadDate));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  };

  const getClassName = (student) => {
    if (!student?.classId || !classes || classes.length === 0) return 'Unassigned';
    const found = classes.find((c) => c.id === student.classId);
    return found ? found.name : 'Unknown';
  };

  const getMostRecentReadDate = (student) => {
    if (!student?.readingSessions || student.readingSessions.length === 0) {
      return student?.lastReadDate || null;
    }
    const sorted = [...student.readingSessions].sort((a, b) => new Date(b.date) - new Date(a.date));
    return sorted[0].date;
  };

  const handleRowClick = (student) => {
    setSelectedStudent(student);
    setOpenSessionsDialog(true);
  };

  const handleIconClick = (e, student) => {
    e.stopPropagation();
    if (markStudentAsPriorityHandled) {
      markStudentAsPriorityHandled(student.id);
    }
  };

  const handlePreferencesClick = (e, student) => {
    e.stopPropagation();
    setSelectedStudent(student);
    setOpenPreferencesDialog(true);
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
          aValue = a.readingSessions.length;
          bValue = b.readingSessions.length;
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
  }, [students, orderBy, order]);

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
            px: { xs: 1.5, sm: 2 }
          }
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
                  sx={{
                    color: 'white !important',
                    '&:hover': { color: 'white !important' },
                    '& .MuiTableSortLabel-icon': { color: 'white !important' },
                    '&.Mui-active': { color: 'white !important' },
                    '&.Mui-active .MuiTableSortLabel-icon': { color: 'white !important' }
                  }}
                >
                  Student
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 600, display: { xs: 'none', sm: 'table-cell' } }}>
                <TableSortLabel
                  active={orderBy === 'class'}
                  direction={orderBy === 'class' ? order : 'asc'}
                  onClick={() => handleRequestSort('class')}
                  sx={{
                    color: 'white !important',
                    '&:hover': { color: 'white !important' },
                    '& .MuiTableSortLabel-icon': { color: 'white !important' },
                    '&.Mui-active': { color: 'white !important' },
                    '&.Mui-active .MuiTableSortLabel-icon': { color: 'white !important' }
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
                  sx={{
                    color: 'white !important',
                    '&:hover': { color: 'white !important' },
                    '& .MuiTableSortLabel-icon': { color: 'white !important' },
                    '&.Mui-active': { color: 'white !important' },
                    '&.Mui-active .MuiTableSortLabel-icon': { color: 'white !important' }
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
                  sx={{
                    color: 'white !important',
                    '&:hover': { color: 'white !important' },
                    '& .MuiTableSortLabel-icon': { color: 'white !important' },
                    '&.Mui-active': { color: 'white !important' },
                    '&.Mui-active .MuiTableSortLabel-icon': { color: 'white !important' }
                  }}
                >
                  Sessions
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 600, textAlign: 'center', width: 80 }}>
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedStudents.map((student) => {
              const status = getReadingStatus(student);
              const statusColor = theme.palette.status?.[status] || theme.palette.primary.main;
              const mostRecentReadDate = getMostRecentReadDate(student);
              
              return (
                <TableRow
                  key={student.id}
                  onClick={() => handleRowClick(student)}
                  sx={{
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease',
                    '&:hover': {
                      bgcolor: 'action.hover',
                    },
                    // Touch-friendly row height
                    height: { xs: 72, sm: 60 },
                    // Add border-left for status indicator
                    borderLeft: `4px solid ${statusColor}`,
                  }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box
                        onClick={(e) => handleIconClick(e, student)}
                        sx={{
                          bgcolor: 'primary.main',
                          color: 'white',
                          width: { xs: 36, sm: 40 },
                          height: { xs: 36, sm: 40 },
                          borderRadius: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          boxShadow: 1,
                          cursor: 'pointer',
                          transition: 'transform 0.2s',
                          '&:hover': {
                            transform: 'scale(1.1)',
                            bgcolor: 'primary.dark'
                          }
                        }}
                      >
                        <MenuBookIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="body1"
                          sx={{
                            fontWeight: 600,
                            fontSize: { xs: '0.95rem', sm: '1rem' },
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {student.name} ({student.readingSessions.length})
                        </Typography>
                        <Typography 
                          variant="body2" 
                          color="text.secondary"
                          sx={{ 
                            fontSize: { xs: '0.75rem', sm: '0.875rem' },
                            display: { xs: 'block', sm: 'none' }
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
                        color={status === 'notRead' ? 'error' : status === 'needsAttention' ? 'warning' : 'success'}
                        sx={{
                          height: { xs: 26, sm: 24 },
                          fontSize: { xs: '0.75rem', sm: '0.7rem' },
                          fontWeight: 500,
                          alignSelf: 'flex-start'
                        }}
                      />
                      <Typography 
                        variant="caption" 
                        color="text.secondary"
                        sx={{ 
                          fontStyle: 'italic',
                          fontSize: { xs: '0.7rem', sm: '0.65rem' }
                        }}
                      >
                        {getDaysSince(student)}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={student.readingSessions.length}
                      size="small"
                      color={student.readingSessions.length === 0 ? 'default' : 'primary'}
                      sx={{
                        height: { xs: 26, sm: 24 },
                        fontSize: { xs: '0.75rem', sm: '0.7rem' },
                        fontWeight: 600,
                        minWidth: { xs: 40, sm: 36 }
                      }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Reading Preferences">
                      <IconButton
                        size="small"
                        onClick={(e) => handlePreferencesClick(e, student)}
                        sx={{ 
                          // Touch-friendly size
                          width: { xs: 44, sm: 40 },
                          height: { xs: 44, sm: 40 },
                          '&:hover': {
                            bgcolor: 'action.hover',
                          }
                        }}
                      >
                        <PsychologyIcon 
                          sx={{ 
                            fontSize: { xs: 22, sm: 20 }, 
                            color: 'primary.main' 
                          }} 
                        />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <StudentSessions
        open={openSessionsDialog}
        onClose={() => {
          setOpenSessionsDialog(false);
          setSelectedStudent(null);
        }}
        student={selectedStudent}
      />
      <ReadingPreferences
        open={openPreferencesDialog}
        onClose={() => {
          setOpenPreferencesDialog(false);
          setSelectedStudent(null);
        }}
        student={selectedStudent}
      />
    </>
  );
};

export default StudentTable;