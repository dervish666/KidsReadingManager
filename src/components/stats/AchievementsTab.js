import React, { useState, useEffect, useMemo, Suspense } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Divider,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Skeleton,
  Button,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BadgeIcon from '../badges/BadgeIcon';
import GardenHeader from '../badges/GardenHeader';
import { BADGE_DEFINITIONS } from '../../utils/badgeDefinitions';
import { stageFromApiName, getAggregateGarden } from '../../utils/gardenStages';
import { METRIC_CONFIG, METRIC_ORDER } from '../goals/goalMetrics';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';

const ClassGoalsEditor = React.lazy(() => import('../goals/ClassGoalsEditor'));
const ClassGoalsDisplay = React.lazy(() => import('../goals/ClassGoalsDisplay'));

const CATEGORY_GROUPS = [
  { label: 'Milestones', categories: ['milestone', 'milestone_batch'] },
  { label: 'Volume', categories: ['volume'] },
  { label: 'Consistency', categories: ['consistency_realtime', 'consistency_batch'] },
  { label: 'Exploration', categories: ['exploration'] },
  { label: 'Secret', categories: ['secret'] },
];

const PROGRESS_GRADIENT = 'linear-gradient(90deg, #8AAD8A, #6B8E6B)';

export default function AchievementsTab({ fetchWithAuth, globalClassFilter }) {
  const { classes } = useData();
  const { setGlobalClassFilter } = useUI();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [classGoals, setClassGoals] = useState(null);
  const [goalsError, setGoalsError] = useState(false);
  const [showGoalEditor, setShowGoalEditor] = useState(false);
  const [showDisplay, setShowDisplay] = useState(false);

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

  useEffect(() => {
    setGoalsError(false);
    if (!globalClassFilter || globalClassFilter === 'all' || globalClassFilter === 'unassigned') {
      setClassGoals(null);
      return;
    }
    fetchWithAuth(`/api/classes/${globalClassFilter}/goals`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setClassGoals)
      .catch(() => {
        setClassGoals(null);
        setGoalsError(true);
      });
  }, [globalClassFilter, fetchWithAuth]);

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
        <Skeleton
          variant="rectangular"
          sx={{ height: { xs: 240, md: 300 }, borderRadius: 3, mb: 2 }}
        />
        <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" width={110} height={40} sx={{ borderRadius: 5 }} />
          ))}
        </Box>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} variant="rectangular" height={56} sx={{ mb: 1, borderRadius: 3 }} />
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

  if (!data) return null;

  return (
    <Box>
      <GardenHeroCard
        data={data}
        classes={classes}
        globalClassFilter={globalClassFilter}
        setGlobalClassFilter={setGlobalClassFilter}
        classGoals={classGoals}
        goalsError={goalsError}
        onEditGoals={() => setShowGoalEditor(true)}
        onShowDisplay={() => setShowDisplay(true)}
      />

      {data.totalBadgesEarned === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body1" color="text.secondary">
            No badges earned yet. As students read and log sessions, the garden will grow.
          </Typography>
        </Box>
      ) : (
        CATEGORY_GROUPS.map((group) => {
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
                  color: 'text.primary',
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
        })
      )}

      <Suspense fallback={null}>
        {showGoalEditor && (
          <ClassGoalsEditor
            open={showGoalEditor}
            onClose={() => setShowGoalEditor(false)}
            classId={globalClassFilter}
            goals={classGoals?.goals || []}
            onSave={(updated) => {
              setClassGoals(updated);
              setShowGoalEditor(false);
            }}
            fetchWithAuth={fetchWithAuth}
          />
        )}
        {showDisplay && (
          <ClassGoalsDisplay
            open={showDisplay}
            onClose={() => setShowDisplay(false)}
            classId={globalClassFilter}
            fetchWithAuth={fetchWithAuth}
          />
        )}
      </Suspense>
    </Box>
  );
}

// The hero: the garden itself, always rendered — goals-driven when a class
// with goals is selected, scaled per student for whole-school/aggregate views.
function GardenHeroCard({
  data,
  classes,
  globalClassFilter,
  setGlobalClassFilter,
  classGoals,
  goalsError,
  onEditGoals,
  onShowDisplay,
}) {
  const classSelected =
    globalClassFilter && globalClassFilter !== 'all' && globalClassFilter !== 'unassigned';
  const selectedClass = classSelected ? classes.find((c) => c.id === globalClassFilter) : null;

  const aggregate = getAggregateGarden(data.totalBadgesEarned, data.totalStudents);
  const goalsStage = classGoals?.gardenStage ? stageFromApiName(classGoals.gardenStage) : null;
  const stage = goalsStage || aggregate.stage;

  const title = selectedClass
    ? `${selectedClass.name} Reading Garden`
    : globalClassFilter === 'unassigned'
      ? 'Reading Garden'
      : 'Whole School Reading Garden';

  const summary = `${data.totalBadgesEarned} badge${data.totalBadgesEarned !== 1 ? 's' : ''} earned · ${data.studentsWithBadges} of ${data.totalStudents} readers · ${stage.name} stage`;

  const classChips = useMemo(
    () => classes.filter((c) => !c.disabled).sort((a, b) => a.name.localeCompare(b.name)),
    [classes]
  );

  const sortedGoals = classGoals?.goals
    ? [...classGoals.goals].sort(
        (a, b) => METRIC_ORDER.indexOf(a.metric) - METRIC_ORDER.indexOf(b.metric)
      )
    : [];

  return (
    <Card sx={{ mb: 3, borderRadius: 3, overflow: 'hidden' }}>
      {classGoals ? (
        <GardenHeader
          stage={classGoals.gardenStage}
          goalsCompleted={classGoals.goalsCompleted}
          height={{ xs: 160, md: 220 }}
          hideLabel
        />
      ) : (
        <GardenHeader
          badgeCount={aggregate.effectiveBadgeCount}
          height={{ xs: 160, md: 220 }}
          hideLabel
        />
      )}

      <CardContent sx={{ pt: 2 }}>
        <Typography
          variant="h6"
          sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: 'text.primary' }}
        >
          {title}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {summary}
        </Typography>

        {/* Class picker — writes the same global filter the header select uses */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <ClassChip
            label="Whole school"
            selected={!classSelected && globalClassFilter !== 'unassigned'}
            onClick={() => setGlobalClassFilter('all')}
          />
          {classChips.map((cls) => (
            <ClassChip
              key={cls.id}
              label={cls.name}
              selected={globalClassFilter === cls.id}
              onClick={() => setGlobalClassFilter(cls.id)}
            />
          ))}
        </Box>

        {classSelected && goalsError && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
            Class goals couldn’t be loaded just now.
          </Typography>
        )}

        {classGoals && (
          <>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {sortedGoals.map((goal) => {
                const config = METRIC_CONFIG[goal.metric];
                if (!config) return null;
                const pct = goal.target > 0 ? Math.min(100, (goal.current / goal.target) * 100) : 0;
                const completed = goal.current >= goal.target;
                return (
                  <Box key={goal.id ?? goal.metric}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        mb: 0.5,
                      }}
                    >
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                          {config.label}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {config.description}
                        </Typography>
                      </Box>
                      {completed ? (
                        <Chip
                          label="Goal reached!"
                          size="small"
                          sx={{
                            height: 24,
                            fontSize: 12,
                            fontWeight: 600,
                            backgroundColor: config.colorEnd,
                            color: 'white',
                          }}
                        />
                      ) : (
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          {goal.current} / {goal.target}
                        </Typography>
                      )}
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={pct}
                      aria-label={`${config.label}: ${goal.current} of ${goal.target}`}
                      sx={{
                        height: 8,
                        borderRadius: 1,
                        backgroundColor: '#E8DFD0',
                        '& .MuiLinearProgress-bar': {
                          background: `linear-gradient(90deg, ${config.color}, ${config.colorEnd})`,
                          borderRadius: 1,
                        },
                      }}
                    />
                  </Box>
                );
              })}
            </Box>
            <Box sx={{ display: 'flex', gap: 1.5, mt: 2, flexWrap: 'wrap' }}>
              <Button variant="contained" onClick={onShowDisplay} sx={{ minHeight: 44 }}>
                Show on whiteboard
              </Button>
              <Button
                variant="outlined"
                onClick={onEditGoals}
                sx={{ minHeight: 44, color: 'primary.dark', borderColor: 'primary.main' }}
              >
                Edit goals
              </Button>
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Selected state uses primary.dark, not main — white chip text needs the
// darker sage to clear 4.5:1 on the filled background
function ClassChip({ label, selected, onClick }) {
  return (
    <Chip
      label={label}
      clickable
      onClick={onClick}
      variant={selected ? 'filled' : 'outlined'}
      sx={{
        height: 40,
        px: 0.5,
        fontSize: '0.875rem',
        borderRadius: 5,
        ...(selected
          ? { bgcolor: 'primary.dark', color: '#fff', '&:hover': { bgcolor: 'primary.dark' } }
          : { borderColor: 'rgba(139, 115, 85, 0.3)', color: 'text.primary' }),
      }}
    />
  );
}

function BadgeAccordion({ badge, totalStudents }) {
  const { def, earnedCount, students: badgeStudents = [] } = badge;
  const fraction = totalStudents > 0 ? (earnedCount / totalStudents) * 100 : 0;
  const tierLabel =
    def.tier === 'single' ? '' : def.tier.charAt(0).toUpperCase() + def.tier.slice(1);

  // Sort: earned first (by date), then unearned by progress descending
  const sortedStudents = useMemo(() => {
    const earned = badgeStudents
      .filter((s) => s.earned)
      .sort((a, b) => a.name.localeCompare(b.name));
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
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {def.name}
            </Typography>
            {tierLabel && <Chip label={tierLabel} size="small" sx={{ height: 22, fontSize: 12 }} />}
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {def.description} · {earnedCount} of {totalStudents} students
          </Typography>
        </Box>
        <Box sx={{ width: 100, mr: 1 }}>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, fraction)}
            aria-label={`${def.name}: earned by ${earnedCount} of ${totalStudents} students`}
            sx={{
              height: 6,
              borderRadius: 1,
              backgroundColor: '#E8DFD0',
              '& .MuiLinearProgress-bar': {
                background: PROGRESS_GRADIENT,
                borderRadius: 1,
              },
            }}
          />
        </Box>
      </AccordionSummary>

      <AccordionDetails sx={{ px: 2, pt: 0, pb: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {sortedStudents.map((s) => (
            <StudentBadgeRow key={s.id} student={s} badgeName={def.name} />
          ))}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}

function StudentBadgeRow({ student, badgeName }) {
  if (student.earned) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5 }}>
        <Typography
          variant="body2"
          sx={{ color: 'text.primary', minWidth: 0, maxWidth: '60%' }}
          noWrap
        >
          {student.name}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label="Earned"
            size="small"
            sx={{
              height: 22,
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: '#6B8E6B',
              color: 'white',
            }}
          />
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', minWidth: 65, textAlign: 'right' }}
          >
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
      <Typography
        variant="body2"
        sx={{ color: 'text.secondary', minWidth: 0, flex: '0 0 auto', maxWidth: '50%' }}
        noWrap
      >
        {student.name}
      </Typography>
      <Box sx={{ flex: 1 }}>
        <LinearProgress
          variant="determinate"
          value={Math.min(100, progress)}
          aria-label={`${student.name}, ${badgeName} progress: ${student.current} of ${student.target}`}
          sx={{
            height: 4,
            borderRadius: 1,
            backgroundColor: '#E8DFD0',
            '& .MuiLinearProgress-bar': {
              background: PROGRESS_GRADIENT,
              borderRadius: 1,
            },
          }}
        />
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
        {student.current}/{student.target}
      </Typography>
    </Box>
  );
}
