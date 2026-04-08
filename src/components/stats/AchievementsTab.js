import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Skeleton,
  Button,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BadgeIcon from '../badges/BadgeIcon';
import { BADGE_DEFINITIONS } from '../../utils/badgeDefinitions';

const CATEGORY_GROUPS = [
  { label: 'Milestones', categories: ['milestone', 'milestone_batch'] },
  { label: 'Volume', categories: ['volume'] },
  { label: 'Consistency', categories: ['consistency_realtime', 'consistency_batch'] },
  { label: 'Exploration', categories: ['exploration'] },
  { label: 'Secret', categories: ['secret'] },
];

const CLASS_GARDEN_STAGES = [
  { name: 'Seedling', min: 0, max: 5 },
  { name: 'Sprout', min: 6, max: 20 },
  { name: 'Bloom', min: 21, max: 50 },
  { name: 'Full Garden', min: 51, max: Infinity },
];

function getClassGardenStage(totalBadges) {
  return (
    CLASS_GARDEN_STAGES.find((s) => totalBadges >= s.min && totalBadges <= s.max) ||
    CLASS_GARDEN_STAGES[0]
  );
}

const STAGE_EMOJI = { Seedling: '🌱', Sprout: '🌿', Bloom: '🌸', 'Full Garden': '🌳' };

export default function AchievementsTab({ fetchWithAuth, globalClassFilter }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadData = () => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    if (globalClassFilter && globalClassFilter !== 'all') {
      params.set('classId', globalClassFilter);
    }
    fetchWithAuth(`/api/badges/summary?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(loadData, [globalClassFilter, fetchWithAuth]);

  // Merge API response with client-side badge definitions
  const enrichedBadges = useMemo(() => {
    if (!data?.badges) return [];
    return data.badges.map((b) => {
      const def = BADGE_DEFINITIONS.find((d) => d.id === b.badgeId);
      return {
        ...b,
        def: def || {
          name: b.badgeId,
          tier: 'single',
          icon: 'bookworm',
          category: 'milestone',
          description: '',
        },
      };
    });
  }, [data]);

  if (loading) {
    return (
      <Box>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
            gap: 2,
            mb: 3,
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} sx={{ borderRadius: 3 }}>
              <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
                <Skeleton variant="text" width="60%" sx={{ mx: 'auto' }} />
                <Skeleton variant="text" width="40%" height={40} sx={{ mx: 'auto' }} />
              </CardContent>
            </Card>
          ))}
        </Box>
        {[1, 2, 3].map((i) => (
          <Skeleton
            key={i}
            variant="rectangular"
            height={56}
            sx={{ mb: 1, borderRadius: 3 }}
          />
        ))}
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          Unable to load achievements.
        </Typography>
        <Button variant="outlined" onClick={loadData} sx={{ borderRadius: 3, fontWeight: 600 }}>
          Retry
        </Button>
      </Box>
    );
  }

  if (!data || data.totalBadgesEarned === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body1" color="text.secondary">
          No badges earned yet. As students read and log sessions, achievements will appear here.
        </Typography>
      </Box>
    );
  }

  const stage = getClassGardenStage(data.totalBadgesEarned);
  const completionRate =
    data.totalStudents > 0
      ? Math.round((data.studentsWithBadges / data.totalStudents) * 100)
      : 0;

  return (
    <Box>
      {/* Summary cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        {[
          { label: 'Total Badges', value: data.totalBadgesEarned, color: '#86A86B' },
          { label: 'Students with Badges', value: data.studentsWithBadges, color: '#6B8F50' },
          { label: 'Completion Rate', value: `${completionRate}%`, color: 'info.main' },
          {
            label: 'Garden Stage',
            value: `${STAGE_EMOJI[stage.name] || ''} ${stage.name}`,
            color: '#5D6B4A',
          },
        ].map(({ label, value, color }) => (
          <Card
            key={label}
            sx={{ borderRadius: 3, boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)' }}
          >
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
          </Card>
        ))}
      </Box>

      {/* Badge cards grouped by category */}
      {CATEGORY_GROUPS.map((group) => {
        const groupBadges = enrichedBadges.filter((b) =>
          group.categories.includes(b.def.category)
        );
        if (groupBadges.length === 0) return null;

        // Hide secret group label if no earned secrets
        if (group.label === 'Secret' && groupBadges.every((b) => b.earnedCount === 0)) {
          return null;
        }

        return (
          <Box key={group.label} sx={{ mb: 3 }}>
            <Typography
              variant="subtitle1"
              sx={{
                fontFamily: '"Nunito", sans-serif',
                fontWeight: 700,
                color: '#3D3427',
                mb: 1.5,
              }}
            >
              {group.label}
            </Typography>

            {groupBadges.map((badge) => (
              <BadgeAccordion
                key={badge.badgeId}
                badge={badge}
                totalStudents={data.totalStudents}
              />
            ))}
          </Box>
        );
      })}
    </Box>
  );
}

function BadgeAccordion({ badge, totalStudents }) {
  const { def, earnedCount, students: badgeStudents = [] } = badge;
  const fraction = totalStudents > 0 ? (earnedCount / totalStudents) * 100 : 0;
  const tierLabel =
    def.tier === 'single' ? '' : def.tier.charAt(0).toUpperCase() + def.tier.slice(1);

  // Sort: earned first (by date), then unearned by progress descending
  const sortedStudents = useMemo(() => {
    const earned = badgeStudents.filter((s) => s.earned).sort((a, b) => a.name.localeCompare(b.name));
    const unearned = badgeStudents
      .filter((s) => !s.earned)
      .sort((a, b) => {
        const progA = a.target > 0 ? a.current / a.target : 0;
        const progB = b.target > 0 ? b.current / b.target : 0;
        return progB - progA;
      });
    return [...earned, ...unearned];
  }, [badgeStudents]);

  return (
    <Accordion
      disableGutters
      elevation={0}
      sx={{
        border: '1px solid #F0E4CC',
        borderRadius: '12px !important',
        mb: 1,
        '&:before': { display: 'none' },
        overflow: 'hidden',
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{ px: 2, '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1.5 } }}
      >
        <BadgeIcon
          badge={{ name: def.name, tier: def.tier, icon: def.icon, description: def.description }}
          size="small"
          showLabel={false}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#3D3427' }}>
              {def.name}
            </Typography>
            {tierLabel && (
              <Chip label={tierLabel} size="small" sx={{ height: 20, fontSize: 10 }} />
            )}
          </Box>
          <Typography variant="caption" sx={{ color: '#8B7E6A' }}>
            {def.description} · {earnedCount} of {totalStudents} students
          </Typography>
        </Box>
        <Box sx={{ width: 100, mr: 1 }}>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, fraction)}
            sx={{
              height: 6,
              borderRadius: 1,
              backgroundColor: '#E8DFD0',
              '& .MuiLinearProgress-bar': {
                background: 'linear-gradient(90deg, #86A86B, #A0C484)',
                borderRadius: 1,
              },
            }}
          />
        </Box>
      </AccordionSummary>

      <AccordionDetails sx={{ px: 2, pt: 0, pb: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {sortedStudents.map((s) => (
            <StudentBadgeRow key={s.id} student={s} />
          ))}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}

function StudentBadgeRow({ student }) {
  if (student.earned) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5 }}>
        <Typography variant="body2" sx={{ color: '#3D3427' }}>
          {student.name}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label="Earned"
            size="small"
            sx={{
              height: 20,
              fontSize: 10,
              fontWeight: 600,
              backgroundColor: '#86A86B',
              color: 'white',
            }}
          />
          <Typography variant="caption" sx={{ color: '#8B7E6A', minWidth: 65, textAlign: 'right' }}>
            {new Date(student.earnedAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
            })}
          </Typography>
        </Box>
      </Box>
    );
  }

  const progress = student.target > 0 ? (student.current / student.target) * 100 : 0;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5 }}>
      <Typography variant="body2" sx={{ color: '#8B7E6A', minWidth: 0, flex: '0 0 auto', maxWidth: '50%' }} noWrap>
        {student.name}
      </Typography>
      <Box sx={{ flex: 1 }}>
        <LinearProgress
          variant="determinate"
          value={Math.min(100, progress)}
          sx={{
            height: 4,
            borderRadius: 1,
            backgroundColor: '#E8DFD0',
            '& .MuiLinearProgress-bar': {
              background: 'linear-gradient(90deg, #86A86B, #A0C484)',
              borderRadius: 1,
            },
          }}
        />
      </Box>
      <Typography variant="caption" sx={{ color: '#8B7E6A', whiteSpace: 'nowrap' }}>
        {student.current}/{student.target}
      </Typography>
    </Box>
  );
}
