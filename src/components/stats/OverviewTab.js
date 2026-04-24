import React from 'react';
import { Box, Typography, Card, CardContent, CardActionArea, Chip } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import HomeIcon from '@mui/icons-material/Home';
import SchoolIcon from '@mui/icons-material/School';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import StreakBadge from '../students/StreakBadge';

export default function OverviewTab({ stats, enrichedTopStreaks, onNavigate }) {
  return (
    <Box>
      {/* Summary stats - responsive grid */}
      <Box
        data-tour="stats-summary-cards"
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        {[
          { label: 'Students', value: stats.totalStudents, color: 'primary.main' },
          { label: 'Sessions', value: stats.totalSessions, color: 'secondary.main' },
          {
            label: 'Avg/Student',
            value: stats.averageSessionsPerStudent.toFixed(1),
            color: 'info.main',
            tab: 2,
          },
          {
            label: 'Never Read',
            value: stats.studentsWithNoSessions,
            color: 'status.needsAttention',
            tab: 1,
          },
        ].map(({ label, value, color, tab }) => {
          const content = (
            <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                {label}
              </Typography>
              <Typography
                variant="h4"
                sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color }}
              >
                {value}
              </Typography>
            </CardContent>
          );
          return (
            <Card
              key={label}
              sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}
            >
              {tab != null && onNavigate ? (
                <CardActionArea onClick={() => onNavigate(tab)} sx={{ height: '100%' }}>
                  {content}
                </CardActionArea>
              ) : (
                content
              )}
            </Card>
          );
        })}
      </Box>

      {/* Main content grid - auto-fill columns */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(auto-fit, minmax(280px, 1fr))',
          },
          gap: 2,
        }}
      >
        {/* This Week's Activity */}
        <Card
          data-tour="stats-weekly-activity"
          sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}
        >
          <CardContent sx={{ py: 2 }}>
            <Typography
              variant="subtitle2"
              gutterBottom
              sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}
            >
              This Week's Activity
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography
                  variant="h4"
                  sx={{
                    fontFamily: '"Nunito", sans-serif',
                    fontWeight: 800,
                    color: 'primary.main',
                  }}
                >
                  {stats.weeklyActivity.thisWeek}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  This Week
                </Typography>
              </Box>
              {stats.weeklyActivity.thisWeek >= stats.weeklyActivity.lastWeek ? (
                <TrendingUpIcon sx={{ fontSize: 28, color: 'status.recentlyRead' }} />
              ) : (
                <TrendingDownIcon sx={{ fontSize: 28, color: 'status.notRead' }} />
              )}
              <Box sx={{ textAlign: 'center' }}>
                <Typography
                  variant="h4"
                  sx={{
                    fontFamily: '"Nunito", sans-serif',
                    fontWeight: 800,
                    color: 'text.secondary',
                  }}
                >
                  {stats.weeklyActivity.lastWeek}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Last Week
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Home vs School Reading */}
        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ py: 2 }}>
            <Typography
              variant="subtitle2"
              gutterBottom
              sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}
            >
              Home vs School
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-around' }}>
              <Box
                sx={{
                  textAlign: 'center',
                  p: 1,
                  borderRadius: 2,
                  bgcolor: 'accent.schoolLight',
                  minWidth: 80,
                }}
              >
                <SchoolIcon sx={{ fontSize: 20, color: 'accent.school' }} />
                <Typography
                  variant="h5"
                  sx={{
                    color: 'accent.school',
                    fontWeight: 800,
                    fontFamily: '"Nunito", sans-serif',
                  }}
                >
                  {stats.locationDistribution.school}
                </Typography>
                <Typography variant="caption" sx={{ color: 'accent.school', fontWeight: 600 }}>
                  School
                </Typography>
              </Box>
              <Box
                sx={{
                  textAlign: 'center',
                  p: 1,
                  borderRadius: 2,
                  bgcolor: 'accent.homeLight',
                  minWidth: 80,
                }}
              >
                <HomeIcon sx={{ fontSize: 20, color: 'accent.home' }} />
                <Typography
                  variant="h5"
                  sx={{ color: 'accent.home', fontWeight: 800, fontFamily: '"Nunito", sans-serif' }}
                >
                  {stats.locationDistribution.home}
                </Typography>
                <Typography variant="caption" sx={{ color: 'accent.home', fontWeight: 600 }}>
                  Home
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Reading by Day of Week */}
        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ py: 2 }}>
            <Typography
              variant="subtitle2"
              gutterBottom
              sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}
            >
              Reading by Day
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 0.25 }}>
              {Object.entries(stats.readingByDay).map(([day, count]) => {
                const maxCount = Math.max(...Object.values(stats.readingByDay), 1);
                const height = Math.max((count / maxCount) * 40, 3);
                return (
                  <Box key={day} sx={{ textAlign: 'center', flex: 1 }}>
                    <Box
                      sx={{
                        height: 50,
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        mb: 0.25,
                      }}
                    >
                      <Box
                        sx={{
                          width: '80%',
                          maxWidth: 20,
                          height: height,
                          bgcolor: count > 0 ? 'primary.main' : 'grey.200',
                          borderRadius: 0.5,
                        }}
                      />
                    </Box>
                    <Typography
                      sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'text.secondary' }}
                    >
                      {day.slice(0, 2)}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </CardContent>
        </Card>

        {/* Reading Streaks Summary */}
        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ py: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              <WhatshotIcon sx={{ color: 'accent.streak', fontSize: 20 }} />
              <Typography
                variant="subtitle2"
                sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}
              >
                Streaks
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-around' }}>
              <Box
                sx={{ textAlign: 'center', p: 1, borderRadius: 2, bgcolor: 'accent.streakLight' }}
              >
                <Typography
                  variant="h5"
                  sx={{
                    color: 'accent.streak',
                    fontWeight: 800,
                    fontFamily: '"Nunito", sans-serif',
                  }}
                >
                  {stats.studentsWithActiveStreak}
                </Typography>
                <Typography sx={{ color: 'accent.streak', fontWeight: 600, fontSize: '0.65rem' }}>
                  Active
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'center', p: 1, borderRadius: 2, bgcolor: 'accent.goldLight' }}>
                <Typography
                  variant="h5"
                  sx={{ color: 'accent.gold', fontWeight: 800, fontFamily: '"Nunito", sans-serif' }}
                >
                  {stats.longestCurrentStreak}
                </Typography>
                <Typography sx={{ color: 'accent.gold', fontWeight: 600, fontSize: '0.65rem' }}>
                  Best
                </Typography>
              </Box>
              <Box
                sx={{
                  textAlign: 'center',
                  p: 1,
                  borderRadius: 2,
                  bgcolor: 'rgba(107, 142, 107, 0.1)',
                }}
              >
                <Typography
                  variant="h5"
                  sx={{
                    color: 'primary.main',
                    fontWeight: 800,
                    fontFamily: '"Nunito", sans-serif',
                  }}
                >
                  {stats.averageStreak.toFixed(1)}
                </Typography>
                <Typography sx={{ color: 'secondary.main', fontWeight: 600, fontSize: '0.65rem' }}>
                  Avg
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Most Read Books */}
        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ py: 2 }}>
            <Typography
              variant="subtitle2"
              gutterBottom
              sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}
            >
              Most Read Books
            </Typography>
            {stats.mostReadBooks.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                No book data yet
              </Typography>
            ) : (
              <Box>
                {stats.mostReadBooks.slice(0, 4).map((book, index) => (
                  <Box
                    key={book.title || index}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}
                  >
                    <Box
                      sx={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        flexShrink: 0,
                        bgcolor: index === 0 ? 'accent.goldLight' : 'rgba(139, 115, 85, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          color: index === 0 ? 'accent.gold' : 'text.secondary',
                        }}
                      >
                        {index + 1}
                      </Typography>
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 500,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '0.8rem',
                      }}
                    >
                      {book.title}
                    </Typography>
                    <Chip
                      label={book.count}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.65rem',
                        bgcolor: 'rgba(107, 142, 107, 0.12)',
                        color: 'primary.dark',
                      }}
                    />
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Streak Leaderboard */}
        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ py: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              <EmojiEventsIcon sx={{ color: 'accent.gold', fontSize: 20 }} />
              <Typography
                variant="subtitle2"
                sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}
              >
                Streak Leaders
              </Typography>
            </Box>
            {enrichedTopStreaks.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                No active streaks
              </Typography>
            ) : (
              <Box>
                {enrichedTopStreaks.slice(0, 4).map((student, index) => (
                  <Box
                    key={student.id}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}
                  >
                    <Box
                      sx={{
                        width: 20,
                        height: 20,
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
                          fontSize: '0.65rem',
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
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 500,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '0.8rem',
                      }}
                    >
                      {student.name}
                    </Typography>
                    <StreakBadge streak={student.currentStreak} size="small" />
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Most Liked Books */}
        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ py: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              <ThumbUpIcon sx={{ color: 'status.recentlyRead', fontSize: 20 }} />
              <Typography
                variant="subtitle2"
                sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}
              >
                Most Liked
              </Typography>
            </Box>
            {!stats.mostLikedBooks || stats.mostLikedBooks.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                No feedback yet
              </Typography>
            ) : (
              <Box>
                {stats.mostLikedBooks.map((book, index) => (
                  <Box
                    key={book.title}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}
                  >
                    <Box
                      sx={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        flexShrink: 0,
                        bgcolor:
                          index === 0 ? 'rgba(74, 110, 74, 0.15)' : 'rgba(139, 115, 85, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          color: index === 0 ? 'status.recentlyRead' : 'text.secondary',
                        }}
                      >
                        {index + 1}
                      </Typography>
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 500,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '0.8rem',
                      }}
                    >
                      {book.title}
                    </Typography>
                    <Chip
                      label={book.count}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.65rem',
                        bgcolor: 'rgba(74, 110, 74, 0.12)',
                        color: 'primary.dark',
                      }}
                    />
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Least Liked Books */}
        <Card sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}>
          <CardContent sx={{ py: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              <ThumbDownIcon sx={{ color: 'status.needsAttention', fontSize: 20 }} />
              <Typography
                variant="subtitle2"
                sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}
              >
                Least Liked
              </Typography>
            </Box>
            {!stats.leastLikedBooks || stats.leastLikedBooks.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                No feedback yet
              </Typography>
            ) : (
              <Box>
                {stats.leastLikedBooks.map((book, index) => (
                  <Box
                    key={book.title}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}
                  >
                    <Box
                      sx={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        flexShrink: 0,
                        bgcolor:
                          index === 0 ? 'rgba(158, 75, 75, 0.12)' : 'rgba(139, 115, 85, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          color: index === 0 ? 'status.needsAttention' : 'text.secondary',
                        }}
                      >
                        {index + 1}
                      </Typography>
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 500,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '0.8rem',
                      }}
                    >
                      {book.title}
                    </Typography>
                    <Chip
                      label={book.count}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.65rem',
                        bgcolor: 'rgba(158, 75, 75, 0.1)',
                        color: 'status.needsAttention',
                      }}
                    />
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
