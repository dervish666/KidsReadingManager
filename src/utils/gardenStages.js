// Single source of truth for Reading Garden stage thresholds.
//
// Two ideas live here:
//   1. Stage names + thresholds, keyed by an "effective badge count" — the
//      number that drives both the stage label and how full the garden
//      illustration looks (GardenHeader reveals elements at counts 1–16).
//   2. Mappings that turn other quantities (class goals completed, aggregate
//      badge totals) into that same effective badge count, so a class can
//      never be a Sprout on one card and a Bloom on another.
//
// The API uses snake_case stage names ('full_garden'); see stageFromApiName.

export const STAGES = [
  { name: 'Seedling', min: 0, max: 2 },
  { name: 'Sprout', min: 3, max: 7 },
  { name: 'Bloom', min: 8, max: 15 },
  { name: 'Full Garden', min: 16, max: Infinity },
];

export function getStage(badgeCount) {
  return STAGES.find((s) => badgeCount >= s.min && badgeCount <= s.max) || STAGES[0];
}

// API gardenStage values ('seedling' | 'sprout' | 'bloom' | 'full_garden') → stage object
export function stageFromApiName(apiName) {
  if (!apiName) return null;
  return STAGES.find((s) => s.name.toLowerCase().replace(/ /g, '_') === apiName) || STAGES[0];
}

// Class goals: map goalsCompleted (0–6) to effective badge counts for
// granular garden filling across the element thresholds
export const GOALS_BADGE_MAP = [0, 1, 3, 5, 9, 13, 16];

export function goalsToEffectiveBadgeCount(goalsCompleted) {
  if (goalsCompleted == null) return 0;
  return GOALS_BADGE_MAP[Math.min(goalsCompleted, GOALS_BADGE_MAP.length - 1)] ?? 0;
}

// Aggregate gardens (whole school, or a class without goals data): scale by
// badges per student so the garden stays meaningful at any cohort size.
// ×2 means the garden reaches Full Garden at ~8 badges per student — roughly
// half the badge catalogue, a genuinely lush result rather than a default.
export function getAggregateGarden(totalBadges, totalStudents) {
  const average = totalStudents > 0 ? totalBadges / totalStudents : 0;
  const effectiveBadgeCount = Math.round(average * 2);
  return { stage: getStage(effectiveBadgeCount), effectiveBadgeCount };
}
