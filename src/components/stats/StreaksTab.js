import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Paper,
  Button,
  Alert,
  CircularProgress,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PersonIcon from '@mui/icons-material/Person';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import StreakBadge from '../students/StreakBadge';

export default function StreaksTab({ stats, studentsWithStreaks, recalculating, onRecalculate }) {
  const studentsWithActiveStreaks = studentsWithStreaks.filter((s) => s.currentStreak > 0);
  const studentsWithNoStreak = studentsWithStreaks.filter((s) => s.currentStreak === 0);

  return (
    <Box>
      {/* Update Streaks Button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={recalculating ? <CircularProgress size={16} /> : <RefreshIcon />}
          onClick={onRecalculate}
          disabled={recalculating}
          sx={{
            borderRadius: 3,
            fontWeight: 600,
            borderWidth: 2,
            borderColor: 'accent.streak',
            color: 'accent.streak',
            '&:hover': {
              borderWidth: 2,
              borderColor: 'accent.streak',
              bgcolor: 'accent.streakLight',
            },
          }}
        >
          {recalculating ? 'Updating...' : 'Update Streaks'}
        </Button>
      </Box>

      {/* Streak Summary Cards - responsive row */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
            <WhatshotIcon sx={{ fontSize: 24, color: 'accent.streak' }} />
            <Typography
              variant="h4"
              sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: 'accent.streak' }}
            >
              {stats.studentsWithActiveStreak}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Active
            </Typography>
          </CardContent>
        </Card>

        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
            <EmojiEventsIcon sx={{ fontSize: 24, color: 'accent.gold' }} />
            <Typography
              variant="h4"
              sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: 'accent.gold' }}
            >
              {stats.longestCurrentStreak}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Best Current
            </Typography>
          </CardContent>
        </Card>

        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
            <Box sx={{ fontSize: 24 }}>🏆</Box>
            <Typography
              variant="h4"
              sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: 'primary.main' }}
            >
              {stats.longestEverStreak}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              All-Time
            </Typography>
          </CardContent>
        </Card>

        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
            <Box sx={{ fontSize: 24 }}>📊</Box>
            <Typography
              variant="h4"
              sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: 'info.main' }}
            >
              {stats.averageStreak.toFixed(1)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Average
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Two-column layout for lists */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        {/* Active Streaks List */}
        <Box>
          <Typography
            variant="subtitle1"
            gutterBottom
            sx={{
              fontFamily: '"Nunito", sans-serif',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            <WhatshotIcon sx={{ color: 'accent.streak', fontSize: 20 }} />
            Active Streaks ({studentsWithActiveStreaks.length})
          </Typography>

          {studentsWithActiveStreaks.length === 0 ? (
            <Alert severity="info" sx={{ borderRadius: 3 }}>
              No active streaks yet
            </Alert>
          ) : (
            <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
              {studentsWithActiveStreaks.map((student, index) => (
                <Box
                  key={student.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 1.5,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      flexShrink: 0,
                      bgcolor:
                        index === 0
                          ? 'accent.goldLight'
                          : index === 2
                            ? 'accent.streakLight'
                            : 'rgba(139, 115, 85, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color:
                          index === 0
                            ? 'accent.gold'
                            : index === 2
                              ? 'accent.streak'
                              : 'text.secondary',
                      }}
                    >
                      {index + 1}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {student.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Best: {student.longestStreak}d
                    </Typography>
                  </Box>
                  <StreakBadge streak={student.currentStreak} size="small" />
                </Box>
              ))}
            </Paper>
          )}
        </Box>

        {/* Students Without Streaks */}
        <Box>
          <Typography
            variant="subtitle1"
            gutterBottom
            sx={{
              fontFamily: '"Nunito", sans-serif',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            <PersonIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
            No Streak ({studentsWithNoStreak.length})
          </Typography>

          {studentsWithNoStreak.length === 0 ? (
            <Alert severity="success" sx={{ borderRadius: 3 }}>
              All students have streaks!
            </Alert>
          ) : (
            <Paper sx={{ borderRadius: 3, overflow: 'hidden', maxHeight: 300, overflowY: 'auto' }}>
              {studentsWithNoStreak.map((student) => (
                <Box
                  key={student.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 1.5,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      flexShrink: 0,
                      bgcolor: 'rgba(139, 115, 85, 0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <PersonIcon sx={{ color: 'text.secondary', fontSize: 14 }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {student.name}
                    </Typography>
                    {student.longestStreak > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        Previous: {student.longestStreak}d
                      </Typography>
                    )}
                  </Box>
                </Box>
              ))}
            </Paper>
          )}
        </Box>
      </Box>
    </Box>
  );
}
