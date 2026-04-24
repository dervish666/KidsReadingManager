import React, { useState, useMemo, useEffect } from 'react';
import { Box, Typography, Paper, Tabs, Tab, CircularProgress } from '@mui/material';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import EmojiNatureIcon from '@mui/icons-material/EmojiNature';
import StreaksTab from './stats/StreaksTab';
import AchievementsTab from './stats/AchievementsTab';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';

const AchievementsPage = () => {
  const { fetchWithAuth } = useAuth();
  const { students, classes, reloadDataFromServer } = useData();
  const { globalClassFilter } = useUI();
  const [currentTab, setCurrentTab] = useState(0);
  const [recalculating, setRecalculating] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Filter students by class (same logic as ReadingStats)
  const activeStudents = useMemo(() => {
    return students.filter((student) => {
      if (globalClassFilter && globalClassFilter !== 'all') {
        if (globalClassFilter === 'unassigned') {
          if (student.classId) return false;
        } else {
          if (student.classId !== globalClassFilter) return false;
        }
      }
      if (!student.classId) return true;
      const studentClass = classes.find((cls) => cls.id === student.classId);
      return !studentClass || !studentClass.disabled;
    });
  }, [students, classes, globalClassFilter]);

  // Fetch stats for streaks (only when Streaks tab is active).
  // AbortController cancels stale requests when the user flips tabs or
  // changes the class filter — otherwise the slower response could clobber
  // newer data.
  useEffect(() => {
    if (currentTab !== 1) return;
    const controller = new AbortController();
    setStatsLoading(true);
    const params = new URLSearchParams();
    if (globalClassFilter && globalClassFilter !== 'all') {
      params.set('classId', globalClassFilter);
    }
    fetchWithAuth(`/api/students/stats?${params}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (controller.signal.aborted) return;
        setStats(data);
        setStatsLoading(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || controller.signal.aborted) return;
        setStats(null);
        setStatsLoading(false);
      });
    return () => controller.abort();
  }, [currentTab, globalClassFilter, fetchWithAuth]);

  const getStudentsWithStreaks = () => {
    return activeStudents
      .map((student) => ({
        ...student,
        currentStreak: student.currentStreak || 0,
        longestStreak: student.longestStreak || 0,
      }))
      .sort((a, b) => {
        if (b.currentStreak !== a.currentStreak) {
          return b.currentStreak - a.currentStreak;
        }
        return b.longestStreak - a.longestStreak;
      });
  };

  const handleRecalculateStreaks = async () => {
    setRecalculating(true);
    try {
      const response = await fetchWithAuth('/api/students/recalculate-streaks', {
        method: 'POST',
      });
      if (response.ok) {
        await reloadDataFromServer();
      }
    } catch (error) {
      console.error('Failed to recalculate streaks:', error);
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <Box>
      <Typography
        variant="h4"
        component="h1"
        sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: 'text.primary', mb: 3 }}
      >
        Achievements
      </Typography>

      <Paper
        sx={{ mb: 3, overflow: 'hidden', borderRadius: 4, backgroundColor: 'background.paper' }}
      >
        <Tabs
          value={currentTab}
          onChange={(e, v) => setCurrentTab(v)}
          indicatorColor="primary"
          textColor="primary"
          aria-label="Achievements tabs"
          sx={{
            '& .MuiTab-root': {
              fontFamily: '"Nunito", sans-serif',
              fontWeight: 700,
              textTransform: 'none',
              fontSize: '1rem',
              minHeight: 64,
            },
          }}
        >
          <Tab icon={<EmojiNatureIcon />} iconPosition="start" label="Badges & Goals" />
          <Tab icon={<WhatshotIcon />} iconPosition="start" label="Streaks" />
        </Tabs>
      </Paper>

      {currentTab === 0 &&
        (students.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
            <Typography variant="body1" color="text.secondary">
              No data available yet. Add students and record reading sessions to see achievements.
            </Typography>
          </Paper>
        ) : (
          <AchievementsTab fetchWithAuth={fetchWithAuth} globalClassFilter={globalClassFilter} />
        ))}

      {currentTab === 1 &&
        (students.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
            <Typography variant="body1" color="text.secondary">
              No data available yet. Add students and record reading sessions to see streaks.
            </Typography>
          </Paper>
        ) : statsLoading || !stats ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <StreaksTab
            stats={stats}
            studentsWithStreaks={getStudentsWithStreaks()}
            recalculating={recalculating}
            onRecalculate={handleRecalculateStreaks}
          />
        ))}
    </Box>
  );
};

export default AchievementsPage;
