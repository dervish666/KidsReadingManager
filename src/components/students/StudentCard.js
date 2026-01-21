import React, { useState, useMemo } from 'react';
import {
  Card,
  CardActionArea,
  CardHeader,
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
import StreakBadge from './StreakBadge';

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
          overflow: 'visible',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          borderRadius: '12px',
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 4px 12px rgba(139, 115, 85, 0.15), 0 2px 4px rgba(0, 0, 0, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.6)',
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: '0 8px 24px rgba(139, 115, 85, 0.2), 0 4px 8px rgba(0, 0, 0, 0.08)',
            zIndex: 10,
          },
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
            p: 0,
            '&:hover': {
              backgroundColor: 'transparent',
            }
          }}
        >
          <CardHeader
            avatar={
              <Box sx={{
                background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
                color: 'white',
                width: 42,
                height: 42,
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(107, 142, 107, 0.3)',
              }}>
                <MenuBookIcon sx={{ fontSize: 22 }} />
              </Box>
            }
            title={
              <Typography
                variant="h6"
                component="div"
                sx={{
                  fontFamily: '"Nunito", sans-serif',
                  fontWeight: 800,
                  fontSize: '1.125rem',
                  color: '#4A4A4A',
                  lineHeight: 1.2
                }}
              >
                {student.name}
              </Typography>
            }
            subheader={
              <Typography
                variant="body2"
                sx={{
                  fontFamily: '"DM Sans", sans-serif',
                  color: '#7A7A7A',
                  fontSize: '0.875rem',
                  mt: 0.5
                }}
              >
                {className}
              </Typography>
            }
            action={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {student.currentStreak > 0 && (
                  <StreakBadge streak={student.currentStreak} size="small" />
                )}
                <Tooltip title="Reading Preferences">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setOpenPreferencesDialog(true);
                    }}
                    sx={{
                      color: '#6B8E6B',
                      backgroundColor: 'rgba(107, 142, 107, 0.1)',
                      '&:hover': { backgroundColor: 'rgba(107, 142, 107, 0.2)' }
                    }}
                  >
                    <PsychologyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Box sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  bgcolor: statusColor,
                  boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.2), 2px 2px 4px rgba(255,255,255,0.5)'
                }} />
              </Box>
            }
            sx={{ pb: 1 }}
          />

          <CardContent sx={{ flexGrow: 1, pt: 1, pb: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                p: 1.5,
                borderRadius: '8px',
                backgroundColor: 'rgba(250, 248, 243, 0.8)',
              }}>
                <Typography variant="body2" sx={{ color: '#7A7A7A', fontWeight: 600 }}>
                  Last read
                </Typography>
                <Chip
                  label={formatDate(mostRecentReadDate || student.lastReadDate)}
                  size="small"
                  sx={{
                    height: 24,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    backgroundColor: status === 'notRead' ? '#F5E1E1' : status === 'needsAttention' ? '#F5EBE0' : '#E5F0E5',
                    color: status === 'notRead' ? '#C17E7E' : status === 'needsAttention' ? '#D4A574' : '#6B8E6B',
                    border: 'none'
                  }}
                />
              </Box>

              <Box sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                p: 1.5,
                borderRadius: '8px',
                backgroundColor: 'rgba(250, 248, 243, 0.8)',
              }}>
                <Typography variant="body2" sx={{ color: '#7A7A7A', fontWeight: 600 }}>
                  Sessions
                </Typography>
                <Chip
                  label={student.readingSessions.length}
                  size="small"
                  sx={{
                    height: 24,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    backgroundColor: '#E5F0E5',
                    color: '#6B8E6B',
                    border: 'none'
                  }}
                />
              </Box>

              <Typography
                variant="caption"
                sx={{
                  color: '#7A7A7A',
                  fontStyle: 'italic',
                  textAlign: 'right',
                  mt: 0.5,
                  fontWeight: 500
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