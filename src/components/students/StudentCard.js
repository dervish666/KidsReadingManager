import React, { useState } from 'react';
import {
  Card,
  CardActionArea,
  CardHeader,
  CardContent,
  Typography,
  Box,
  Chip,
} from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import BlockIcon from '@mui/icons-material/Block';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';
import { useTheme } from '@mui/material/styles';
import StudentDetailDrawer from './StudentDetailDrawer';
import StreakBadge from './StreakBadge';
import BadgeIndicators from '../badges/BadgeIndicators';
import { STATUS_TO_PALETTE } from '../../utils/helpers';

const StudentCard = React.memo(({ student }) => {
  const theme = useTheme();
  const { classes } = useData();
  const { getReadingStatus } = useUI();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const status = getReadingStatus(student);
  const paletteKey = STATUS_TO_PALETTE[status] || 'notRead';
  const statusColor = theme.palette.status?.[paletteKey] || theme.palette.primary.main;

  const mostRecentReadDate = student?.lastReadDate || null;

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const daysSince = (() => {
    if (!mostRecentReadDate) return 'Never read';
    const diffTime = Math.max(0, new Date() - new Date(mostRecentReadDate));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  })();

  const className = (() => {
    if (!student?.classId || !classes || classes.length === 0) return 'Unassigned';
    const found = classes.find((c) => c.id === student.classId);
    return found ? found.name : 'Unknown';
  })();

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
          backgroundColor: 'background.paper',
          boxShadow: '0 4px 12px rgba(139, 115, 85, 0.15), 0 2px 4px rgba(0, 0, 0, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.6)',
          '@media (hover: hover) and (pointer: fine)': {
            '&:hover': {
              transform: 'translateY(-4px)',
              boxShadow: '0 8px 24px rgba(139, 115, 85, 0.2), 0 4px 8px rgba(0, 0, 0, 0.08)',
              zIndex: 10,
            },
          },
        }}
      >
        <CardActionArea
          onClick={() => setDrawerOpen(true)}
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            textAlign: 'left',
            p: 0,
            '&:hover': {
              backgroundColor: 'transparent',
            },
          }}
        >
          <CardHeader
            avatar={
              <Box
                sx={{
                  background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
                  color: 'white',
                  width: 42,
                  height: 42,
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(107, 142, 107, 0.3)',
                }}
              >
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
                  color: 'text.primary',
                  lineHeight: 1.2,
                }}
              >
                {student.name}
              </Typography>
            }
            subheader={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: '"DM Sans", sans-serif',
                    color: 'text.secondary',
                    fontSize: '0.875rem',
                  }}
                >
                  {className}
                </Typography>
                {student.processingRestricted && (
                  <Chip
                    icon={<BlockIcon sx={{ fontSize: 12 }} />}
                    label="Restricted"
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      backgroundColor: 'rgba(158, 75, 75, 0.1)',
                      color: 'status.notRead',
                      '& .MuiChip-icon': { color: 'status.notRead' },
                      border: '1px solid rgba(158, 75, 75, 0.2)',
                    }}
                  />
                )}
              </Box>
            }
            action={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {student.currentStreak > 0 && (
                  <StreakBadge streak={student.currentStreak} size="small" />
                )}
                {student.badges && student.badges.length > 0 && (
                  <BadgeIndicators badges={student.badges} />
                )}
                <Box
                  role="img"
                  aria-label={`Status: ${{ recent: 'Recently read', attention: 'Needs attention', never: 'Not read', overdue: 'Overdue' }[status] || status}`}
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: statusColor,
                    boxShadow:
                      'inset 2px 2px 4px rgba(0,0,0,0.2), 2px 2px 4px rgba(255,255,255,0.5)',
                  }}
                />
              </Box>
            }
            sx={{ pb: 1 }}
          />

          <CardContent sx={{ flexGrow: 1, pt: 1, pb: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  p: 1.5,
                  borderRadius: '8px',
                  backgroundColor: 'rgba(250, 248, 243, 0.8)',
                }}
              >
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
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
                    backgroundColor:
                      paletteKey === 'notRead'
                        ? 'rgba(158, 75, 75, 0.1)'
                        : paletteKey === 'needsAttention'
                          ? 'rgba(155, 110, 58, 0.1)'
                          : 'rgba(74, 110, 74, 0.1)',
                    color:
                      paletteKey === 'notRead'
                        ? 'error.main'
                        : paletteKey === 'needsAttention'
                          ? 'warning.main'
                          : 'primary.main',
                    border: 'none',
                  }}
                />
              </Box>

              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  p: 1.5,
                  borderRadius: '8px',
                  backgroundColor: 'rgba(250, 248, 243, 0.8)',
                }}
              >
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  Sessions
                </Typography>
                <Chip
                  label={student.totalSessionCount || 0}
                  size="small"
                  sx={{
                    height: 24,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    backgroundColor: 'success.light',
                    color: 'primary.main',
                    border: 'none',
                  }}
                />
              </Box>

              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  fontStyle: 'italic',
                  textAlign: 'right',
                  mt: 0.5,
                  fontWeight: 500,
                }}
              >
                {daysSince}
              </Typography>
            </Box>
          </CardContent>
        </CardActionArea>
      </Card>

      <StudentDetailDrawer
        open={drawerOpen}
        student={student}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
});

export default StudentCard;
// Note: React.memo wraps the component definition above
