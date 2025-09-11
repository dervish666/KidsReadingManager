import React, { useState, useMemo } from 'react';
import {
  Card,
  CardActionArea,
  CardHeader,
  Avatar,
  CardContent,
  Typography,
  Box,
  Chip,
  IconButton,
  Tooltip
} from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { useAppContext } from '../../contexts/AppContext';
import { useTheme } from '@mui/material/styles';
import StudentSessions from '../sessions/StudentSessions';
import ReadingPreferences from './ReadingPreferences';

const StudentCard = ({ student }) => {
  const theme = useTheme();
  const { getReadingStatus, classes } = useAppContext();
  const [openSessionsDialog, setOpenSessionsDialog] = useState(false);
  const [openPreferencesDialog, setOpenPreferencesDialog] = useState(false);

  const status = getReadingStatus(student);
  const statusColor = theme.palette.status?.[status] || theme.palette.primary.main;

  const mostRecentReadDate = useMemo(() => {
    if (!student?.readingSessions || student.readingSessions.length === 0) {
      return student?.lastReadDate || null;
    }
    const sorted = [...student.readingSessions].sort((a, b) => new Date(b.date) - new Date(a.date));
    return sorted[0].date;
  }, [student]);

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const daysSince = useMemo(() => {
    const dateToUse = mostRecentReadDate || student?.lastReadDate;
    if (!dateToUse) return 'Never read';
    const diffTime = Math.max(0, new Date() - new Date(dateToUse));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }, [mostRecentReadDate, student]);

  const className = useMemo(() => {
    if (!student?.classId || !classes || classes.length === 0) return 'Unassigned';
    const found = classes.find((c) => c.id === student.classId);
    return found ? found.name : 'Unknown';
  }, [student?.classId, classes]);

  return (
    <>
      <Card
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.18s ease-in-out',
          borderRadius: { xs: 12, sm: 16 },
          p: { xs: 0.5, sm: 0 },
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: (theme) => theme.shadows[3],
          },
          '@media (max-width: 600px)': {
            '&:hover': {
              transform: 'translateY(-2px)',
            }
          }
        }}
      >
        <CardActionArea
          onClick={() => setOpenSessionsDialog(true)}
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            textAlign: 'left',
            p: { xs: 1, sm: 0 },
            gap: 1,
            cursor: 'pointer',
            '&:focus-visible': {
              outline: '3px solid',
              outlineColor: (theme) => theme.palette.primary.main,
              outlineOffset: '3px',
            },
            '@media (hover: none)': {
              '&:hover': {
                backgroundColor: 'transparent',
              }
            }
          }}
          aria-label={`View sessions for ${student.name}`}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpenSessionsDialog(true);
            }
          }}
        >
          <CardHeader
            avatar={
              <Box sx={{
                bgcolor: 'primary.main',
                color: 'white',
                width: { xs: 40, sm: 44 },
                height: { xs: 40, sm: 44 },
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 1
              }}>
                <MenuBookIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />
              </Box>
            }
            title={
              <Typography
                variant="h6"
                component="div"
                sx={{
                  fontWeight: 600,
                  fontSize: { xs: '1rem', sm: '1.125rem' },
                  lineHeight: 1.2
                }}
              >
                {student.name}
              </Typography>
            }
            subheader={
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  fontSize: { xs: '0.75rem', sm: '0.875rem' }
                }}
              >
                {className}
              </Typography>
            }
            action={
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mr: { xs: 1, sm: 2 }
              }}>
                <Tooltip title="Reading Preferences">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenPreferencesDialog(true);
                    }}
                    sx={{ padding: { xs: 0.5, sm: 1 } }}
                  >
                    <PsychologyIcon sx={{ fontSize: { xs: 16, sm: 18 }, color: 'primary.main' }} />
                  </IconButton>
                </Tooltip>
                <Box sx={{
                  width: { xs: 8, sm: 10 },
                  height: { xs: 8, sm: 10 },
                  borderRadius: 0,
                  bgcolor: statusColor,
                  boxShadow: 1
                }} />
              </Box>
            }
            sx={{
              pb: 1,
              '& .MuiCardHeader-content': {
                minWidth: 0,
                flex: 1
              }
            }}
          />

          <CardContent sx={{
            flexGrow: 1,
            pt: { xs: 0.5, sm: 0 },
            pb: { xs: 2, sm: 3 },
            '&:last-child': { pb: { xs: 2, sm: 3 } }
          }}>
            <Box sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: { xs: 1.5, sm: 2 }
            }}>
              <Box sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 1
              }}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                >
                  Last read
                </Typography>
                <Chip
                  label={formatDate(mostRecentReadDate || student.lastReadDate)}
                  size="small"
                  color={status === 'notRead' ? 'error' : status === 'needsAttention' ? 'warning' : 'success'}
                  sx={{
                    height: { xs: 24, sm: 28 },
                    fontSize: { xs: '0.7rem', sm: '0.75rem' }
                  }}
                />
              </Box>

              <Box sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 1
              }}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                >
                  Sessions
                </Typography>
                <Chip
                  label={student.readingSessions.length}
                  size="small"
                  color={student.readingSessions.length === 0 ? 'default' : 'primary'}
                  sx={{
                    height: { xs: 24, sm: 28 },
                    fontSize: { xs: '0.7rem', sm: '0.75rem' }
                  }}
                />
              </Box>

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  fontStyle: 'italic',
                  fontSize: { xs: '0.75rem', sm: '0.875rem' },
                  opacity: 0.8,
                  alignSelf: 'flex-start'
                }}
              >
                {daysSince}
              </Typography>
            </Box>
          </CardContent>
        </CardActionArea>
      </Card>

      <StudentSessions open={openSessionsDialog} onClose={() => setOpenSessionsDialog(false)} student={student} />
      <ReadingPreferences open={openPreferencesDialog} onClose={() => setOpenPreferencesDialog(false)} student={student} />
    </>
  );
};

export default StudentCard;