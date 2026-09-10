import React, { useState, useEffect, useMemo, Suspense } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Divider,
  LinearProgress,
  Skeleton,
  Button,
  ButtonBase,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { BadgeArt, TIER_COLORS, tierLabelFor } from '../badges/BadgeIcon';
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

// One accent for progress (sage) and one for "done" (gold). The goals used to
// carry a gradient per metric ending in a brown chip, and the badge rows a
// gradient bar each, so the page changed colour every hundred pixels.
const GOLD_DARK = '#8F6B00';
const TILE_BORDER = '1px solid #F0E4CC';

/**
 * Badge families: definitions grouped by display name, tiers in catalogue
 * order. Bookworm has four tiers; First Finish has one.
 */
export const BADGE_FAMILIES = (() => {
  const byName = new Map();
  for (const def of BADGE_DEFINITIONS) {
    if (!byName.has(def.name)) {
      byName.set(def.name, {
        name: def.name,
        icon: def.icon,
        category: def.category,
        isSecret: Boolean(def.isSecret),
        tiers: [],
      });
    }
    byName.get(def.name).tiers.push(def);
  }
  return [...byName.values()];
})();

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
  const [openBadge, setOpenBadge] = useState(null);

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

  // API summary rows keyed by badge id; a badge the API did not mention
  // (secret badges nobody has earned) reads as zero.
  const summaryById = useMemo(() => {
    const map = new Map();
    for (const b of data?.badges || []) map.set(b.badgeId, b);
    return map;
  }, [data]);

  if (loading) {
    return (
      <Box>
        <Skeleton
          variant="rectangular"
          sx={{ height: { xs: 200, md: 300 }, borderRadius: 3, mb: 2 }}
        />
        <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" width={110} height={40} sx={{ borderRadius: 5 }} />
          ))}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rectangular" height={132} sx={{ borderRadius: 3 }} />
          ))}
        </Box>
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

  const totalStudents = data.totalStudents || 0;

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

      {data.totalBadgesEarned === 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          No badges earned yet. These are the ones waiting to be won, and every logged session
          counts towards them.
        </Typography>
      )}

      {CATEGORY_GROUPS.map((group) => {
        const families = BADGE_FAMILIES.filter((f) => group.categories.includes(f.category));
        // Secret badges stay hidden until somebody has one
        const visible = families.filter(
          (f) => !f.isSecret || f.tiers.some((t) => (summaryById.get(t.id)?.earnedCount || 0) > 0)
        );
        if (visible.length === 0) return null;

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
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                gap: 2,
              }}
            >
              {visible.map((family) => (
                <BadgeFamilyTile
                  key={family.name}
                  family={family}
                  summaryById={summaryById}
                  totalStudents={totalStudents}
                  onOpen={(def) => setOpenBadge(def)}
                />
              ))}
            </Box>
          </Box>
        );
      })}

      <BadgeStudentsDialog
        def={openBadge}
        summary={openBadge ? summaryById.get(openBadge.id) : null}
        totalStudents={totalStudents}
        onClose={() => setOpenBadge(null)}
      />

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

// The hero: the garden itself, always rendered. Goals-driven when a class
// with goals is selected, scaled per student for whole-school views.
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

  const badgeWord = data.totalBadgesEarned === 1 ? 'badge' : 'badges';
  const summary =
    data.totalBadgesEarned === 0
      ? `${data.totalStudents} readers, nothing earned yet`
      : `${data.totalBadgesEarned} ${badgeWord} earned by ${data.studentsWithBadges} of ${data.totalStudents} readers`;

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
          height={{ xs: 200, md: 300 }}
          label={title}
          hideLabel
        />
      ) : (
        <GardenHeader
          badgeCount={aggregate.effectiveBadgeCount}
          height={{ xs: 200, md: 300 }}
          label={title}
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
          {summary}. {stage.name} stage.
        </Typography>

        {/* Class picker, writes the same global filter the header select uses */}
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
            <Typography
              variant="subtitle2"
              sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, mb: 1.5 }}
            >
              Class goals this year
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                columnGap: 3,
                rowGap: 2,
              }}
            >
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
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: 1,
                        mb: 0.5,
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                          {config.label}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {config.description}
                        </Typography>
                      </Box>
                      {completed ? (
                        <Chip
                          label="Reached"
                          size="small"
                          sx={{
                            height: 24,
                            fontSize: 12,
                            fontWeight: 700,
                            backgroundColor: GOLD_DARK,
                            color: '#fff',
                          }}
                        />
                      ) : (
                        <Typography
                          variant="body2"
                          sx={{ color: 'text.primary', fontWeight: 600, whiteSpace: 'nowrap' }}
                        >
                          {goal.current} of {goal.target}
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
                        backgroundColor: '#EDE6D6',
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: completed ? GOLD_DARK : 'primary.main',
                          borderRadius: 1,
                        },
                      }}
                    />
                  </Box>
                );
              })}
            </Box>
            <Box sx={{ display: 'flex', gap: 1.5, mt: 2.5, flexWrap: 'wrap' }}>
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

// Selected state uses primary.dark, not main: white chip text needs the
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

/**
 * One tile per badge family. The rosette is lit once anyone has the lowest
 * tier; each tier underneath shows how many readers hold it and opens the
 * per-student list. Counts are numbers, not bars: "0 of 24" as an empty
 * grey track was the single most repeated element on the old page.
 */
function BadgeFamilyTile({ family, summaryById, totalStudents, onOpen }) {
  const counts = family.tiers.map((t) => summaryById.get(t.id)?.earnedCount || 0);
  const anyEarned = counts.some((c) => c > 0);
  // Highest tier anyone holds decides the pip on the big rosette
  let topTier = family.tiers[0].tier;
  family.tiers.forEach((t, i) => {
    if (counts[i] > 0) topTier = t.tier;
  });
  const single = family.tiers.length === 1;
  const lead = family.tiers[0];

  return (
    <Box
      sx={{
        border: TILE_BORDER,
        borderRadius: 3,
        backgroundColor: 'background.paper',
        p: 2,
        display: 'flex',
        gap: 2,
        alignItems: 'flex-start',
        minWidth: 0,
      }}
    >
      <BadgeArt
        icon={family.icon}
        tier={single ? lead.tier : topTier}
        size={72}
        earned={anyEarned}
        sx={{ mt: 0.25 }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontFamily: '"Nunito", sans-serif',
            fontWeight: 800,
            fontSize: '1.05rem',
            color: 'text.primary',
            lineHeight: 1.2,
          }}
        >
          {family.name}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.25 }}>
          {lead.description}
        </Typography>

        {single ? (
          <TierButton
            def={lead}
            count={counts[0]}
            totalStudents={totalStudents}
            onClick={() => onOpen(lead)}
            wide
          />
        ) : (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {family.tiers.map((def, i) => (
              <TierButton
                key={def.id}
                def={def}
                count={counts[i]}
                totalStudents={totalStudents}
                onClick={() => onOpen(def)}
              />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function TierButton({ def, count, totalStudents, onClick, wide = false }) {
  const earned = count > 0;
  const tierLabel = tierLabelFor(def.tier);
  const label = wide ? `${count} of ${totalStudents} readers` : `${count} of ${totalStudents}`;
  return (
    <ButtonBase
      onClick={onClick}
      aria-label={`${def.name}${tierLabel ? ` ${tierLabel}` : ''}, earned by ${count} of ${totalStudents} readers. Show readers`}
      sx={{
        minHeight: 44,
        px: 1.25,
        py: 0.5,
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        textAlign: 'left',
        border: '1px solid',
        borderColor: earned ? 'rgba(107, 142, 107, 0.45)' : 'rgba(139, 115, 85, 0.18)',
        backgroundColor: earned ? 'rgba(138, 173, 138, 0.12)' : 'transparent',
        '&:hover': { backgroundColor: 'rgba(138, 173, 138, 0.2)' },
        '&.Mui-focusVisible': { outline: '2px solid #6B8E6B', outlineOffset: 2 },
        '&:active': { transform: 'scale(0.98)' },
      }}
    >
      {tierLabel && (
        <Box
          aria-hidden="true"
          sx={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: earned ? TIER_COLORS[def.tier] : '#CFC6B4',
            flex: '0 0 auto',
          }}
        />
      )}
      <Box sx={{ lineHeight: 1.15 }}>
        {tierLabel && (
          <Typography
            component="span"
            sx={{
              display: 'block',
              fontSize: 12,
              fontWeight: 700,
              color: earned ? 'text.primary' : 'text.secondary',
            }}
          >
            {tierLabel}
          </Typography>
        )}
        <Typography
          component="span"
          sx={{
            display: 'block',
            fontSize: tierLabel ? 12 : 14,
            fontWeight: tierLabel ? 500 : 600,
            color: earned ? 'primary.dark' : 'text.secondary',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {label}
        </Typography>
      </Box>
    </ButtonBase>
  );
}

/** Who has this badge, and how close everyone else is. */
function BadgeStudentsDialog({ def, summary, totalStudents, onClose }) {
  const open = Boolean(def);
  const tierLabel = def ? tierLabelFor(def.tier) : '';

  const { earned, unearned } = useMemo(() => {
    const rows = summary?.students || [];
    return {
      earned: rows.filter((s) => s.earned).sort((a, b) => a.name.localeCompare(b.name)),
      unearned: rows
        .filter((s) => !s.earned)
        .sort((a, b) => {
          const progA = a.target > 0 ? a.current / a.target : 0;
          const progB = b.target > 0 ? b.current / b.target : 0;
          return progB - progA;
        }),
    };
  }, [summary]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{ paper: { sx: { borderRadius: 3 } } }}
    >
      {def && (
        <>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
            <BadgeArt icon={def.icon} tier={def.tier} size={56} />
            <Box sx={{ minWidth: 0 }}>
              <Typography
                component="div"
                sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, fontSize: '1.1rem' }}
              >
                {def.name}
                {tierLabel ? ` ${tierLabel}` : ''}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {def.description}
              </Typography>
            </Box>
          </DialogTitle>
          <DialogContent dividers sx={{ px: 3 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
              Earned by {earned.length} of {totalStudents} readers
            </Typography>

            {earned.length > 0 && (
              <Box sx={{ mb: unearned.length > 0 ? 2.5 : 0 }}>
                {earned.map((s) => (
                  <Box
                    key={s.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      py: 0.75,
                    }}
                  >
                    <Typography variant="body2" sx={{ color: 'text.primary' }} noWrap>
                      {s.name}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: GOLD_DARK, fontWeight: 700, whiteSpace: 'nowrap' }}
                    >
                      {formatEarned(s.earnedAt)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}

            {unearned.length > 0 && (
              <>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.5 }}
                >
                  Still working on it
                </Typography>
                {unearned.map((s) => (
                  <Box
                    key={s.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      py: 0.75,
                    }}
                  >
                    <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>
                      {s.name}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.secondary',
                        whiteSpace: 'nowrap',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {s.current} of {s.target}
                    </Typography>
                  </Box>
                ))}
              </>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 1.5 }}>
            <Button onClick={onClose} sx={{ minHeight: 44, fontWeight: 600 }}>
              Close
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

function formatEarned(earnedAt) {
  if (!earnedAt) return 'Earned';
  const d = new Date(earnedAt.includes('T') ? earnedAt : `${earnedAt.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return 'Earned';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
