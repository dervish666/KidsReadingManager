/**
 * Badge definitions for the achievement system.
 *
 * Each badge is a pure object with evaluate() and progress() functions.
 * evaluate(stats, context) → boolean (has the badge been earned?)
 * progress(stats, context) → { current, target } (how close?)
 *
 * stats: camelCase object from student_reading_stats row
 * context: { keyStage, streak, termDates, currentDate, earnedBadgeIds, sessions }
 */

// ── Key Stage Resolution ────────────────────────────────────────────────────

const KEY_STAGE_MAP = {
  Reception: 'KS1',
  Y1: 'KS1',
  Y2: 'KS1',
  Y3: 'LowerKS2',
  Y4: 'LowerKS2',
  Y5: 'UpperKS2',
  Y6: 'UpperKS2',
};

export const resolveKeyStage = (yearGroup) => KEY_STAGE_MAP[yearGroup] || 'LowerKS2';

// ── Helpers ─────────────────────────────────────────────────────────────────

const threshold = (ks, thresholds) => thresholds[ks] ?? thresholds.LowerKS2;

// ── Real-time badge categories ──────────────────────────────────────────────
const REALTIME_CATEGORIES = ['volume', 'consistency_realtime', 'milestone'];

// ── Badge Definitions ───────────────────────────────────────────────────────

export const BADGE_DEFINITIONS = [
  // ── Volume: Bookworm (4 tiers) ──────────────────────────────────────────
  {
    id: 'bookworm_bronze',
    name: 'Bookworm',
    tier: 'bronze',
    category: 'volume',
    description: 'Read your first books',
    unlockMessage: "You've started your reading journey! Your garden is sprouting.",
    icon: 'bookworm',
    keyStageThresholds: { KS1: 5, LowerKS2: 8, UpperKS2: 10 },
    evaluate: (stats, ctx) =>
      stats.totalBooks >= threshold(ctx.keyStage, { KS1: 5, LowerKS2: 8, UpperKS2: 10 }),
    progress: (stats, ctx) => ({
      current: stats.totalBooks,
      target: threshold(ctx.keyStage, { KS1: 5, LowerKS2: 8, UpperKS2: 10 }),
    }),
  },
  {
    id: 'bookworm_silver',
    name: 'Bookworm',
    tier: 'silver',
    category: 'volume',
    description: 'A growing collection of books read',
    unlockMessage: 'Your reading garden is flourishing! So many stories explored.',
    icon: 'bookworm',
    keyStageThresholds: { KS1: 15, LowerKS2: 25, UpperKS2: 30 },
    evaluate: (stats, ctx) =>
      stats.totalBooks >= threshold(ctx.keyStage, { KS1: 15, LowerKS2: 25, UpperKS2: 30 }),
    progress: (stats, ctx) => ({
      current: stats.totalBooks,
      target: threshold(ctx.keyStage, { KS1: 15, LowerKS2: 25, UpperKS2: 30 }),
    }),
  },
  {
    id: 'bookworm_gold',
    name: 'Bookworm',
    tier: 'gold',
    category: 'volume',
    description: 'An impressive reading achievement',
    unlockMessage: 'What an incredible reader you are! Your garden is blooming beautifully.',
    icon: 'bookworm',
    keyStageThresholds: { KS1: 30, LowerKS2: 50, UpperKS2: 60 },
    evaluate: (stats, ctx) =>
      stats.totalBooks >= threshold(ctx.keyStage, { KS1: 30, LowerKS2: 50, UpperKS2: 60 }),
    progress: (stats, ctx) => ({
      current: stats.totalBooks,
      target: threshold(ctx.keyStage, { KS1: 30, LowerKS2: 50, UpperKS2: 60 }),
    }),
  },
  {
    id: 'bookworm_star',
    name: 'Bookworm',
    tier: 'star',
    category: 'volume',
    description: 'A truly remarkable reading journey',
    unlockMessage: 'A star reader! Your reading garden is a wonder to behold.',
    icon: 'bookworm',
    keyStageThresholds: { KS1: 50, LowerKS2: 80, UpperKS2: 100 },
    evaluate: (stats, ctx) =>
      stats.totalBooks >= threshold(ctx.keyStage, { KS1: 50, LowerKS2: 80, UpperKS2: 100 }),
    progress: (stats, ctx) => ({
      current: stats.totalBooks,
      target: threshold(ctx.keyStage, { KS1: 50, LowerKS2: 80, UpperKS2: 100 }),
    }),
  },

  // ── Volume: Time Traveller (3 tiers) ───────────────────────────────────
  {
    id: 'time_traveller_bronze',
    name: 'Time Traveller',
    tier: 'bronze',
    category: 'volume',
    description: 'Minutes spent reading',
    unlockMessage: 'All that reading time is paying off! Your garden is growing.',
    icon: 'clock',
    keyStageThresholds: { KS1: 200, LowerKS2: 400, UpperKS2: 600 },
    evaluate: (stats, ctx) =>
      stats.totalMinutes >= threshold(ctx.keyStage, { KS1: 200, LowerKS2: 400, UpperKS2: 600 }),
    progress: (stats, ctx) => ({
      current: stats.totalMinutes,
      target: threshold(ctx.keyStage, { KS1: 200, LowerKS2: 400, UpperKS2: 600 }),
    }),
  },
  {
    id: 'time_traveller_silver',
    name: 'Time Traveller',
    tier: 'silver',
    category: 'volume',
    description: 'A dedicated reader',
    unlockMessage: "You've spent so much time with wonderful stories!",
    icon: 'clock',
    keyStageThresholds: { KS1: 600, LowerKS2: 1200, UpperKS2: 1800 },
    evaluate: (stats, ctx) =>
      stats.totalMinutes >= threshold(ctx.keyStage, { KS1: 600, LowerKS2: 1200, UpperKS2: 1800 }),
    progress: (stats, ctx) => ({
      current: stats.totalMinutes,
      target: threshold(ctx.keyStage, { KS1: 600, LowerKS2: 1200, UpperKS2: 1800 }),
    }),
  },
  {
    id: 'time_traveller_gold',
    name: 'Time Traveller',
    tier: 'gold',
    category: 'volume',
    description: 'A truly committed reader',
    unlockMessage: 'What a time traveller! Hours upon hours of reading adventures.',
    icon: 'clock',
    keyStageThresholds: { KS1: 1500, LowerKS2: 3000, UpperKS2: 5000 },
    evaluate: (stats, ctx) =>
      stats.totalMinutes >= threshold(ctx.keyStage, { KS1: 1500, LowerKS2: 3000, UpperKS2: 5000 }),
    progress: (stats, ctx) => ({
      current: stats.totalMinutes,
      target: threshold(ctx.keyStage, { KS1: 1500, LowerKS2: 3000, UpperKS2: 5000 }),
    }),
  },

  // ── Consistency: Steady Reader ──────────────────────────────────────────
  {
    id: 'steady_reader',
    name: 'Steady Reader',
    tier: 'single',
    category: 'consistency_realtime',
    description: 'Read on 3 different days in one week',
    unlockMessage: "Three days of reading this week! You're building a great habit.",
    icon: 'sun',
    evaluate: (stats) => stats.daysReadThisWeek >= 3,
    progress: (stats) => ({ current: stats.daysReadThisWeek, target: 3 }),
  },

  // ── Consistency: Week Warrior ───────────────────────────────────────────
  {
    id: 'week_warrior',
    name: 'Week Warrior',
    tier: 'single',
    category: 'consistency_realtime',
    description: 'Read every day in one week',
    unlockMessage: 'A whole week of reading! Your reading garden is thriving.',
    icon: 'sun',
    evaluate: (stats) => stats.daysReadThisWeek >= 7,
    progress: (stats) => ({ current: stats.daysReadThisWeek, target: 7 }),
  },

  // ── Consistency: Monthly Marvel (batch) ─────────────────────────────────
  {
    id: 'monthly_marvel',
    name: 'Monthly Marvel',
    tier: 'single',
    category: 'consistency_batch',
    description: 'Read 4+ days every week for a whole month',
    unlockMessage: 'A whole month of steady reading! That takes real dedication.',
    icon: 'sun',
    evaluate: (stats) => stats.weeksWith4PlusDays >= 4,
    progress: (stats) => ({ current: stats.weeksWith4PlusDays, target: 4 }),
  },

  // ── Milestone: First Finish ─────────────────────────────────────────────
  {
    id: 'first_finish',
    name: 'First Finish',
    tier: 'single',
    category: 'milestone',
    description: 'Log your first book',
    unlockMessage: 'Your very first book! Every reading garden starts with a single seed.',
    icon: 'seedling',
    evaluate: (stats) => stats.totalBooks >= 1,
    progress: (stats) => ({ current: stats.totalBooks, target: 1 }),
  },

  // ── Milestone: Series Finisher (batch) ──────────────────────────────────
  {
    id: 'series_finisher',
    name: 'Series Finisher',
    tier: 'single',
    category: 'milestone_batch',
    description: 'Read 3 or more books by the same author',
    unlockMessage: "You found an author you love! That's a special connection.",
    icon: 'flower',
    evaluate: (_stats, ctx) => {
      if (!ctx.authorBookCounts) return false;
      return Object.values(ctx.authorBookCounts).some((count) => count >= 3);
    },
    progress: (_stats, ctx) => {
      if (!ctx.authorBookCounts) return { current: 0, target: 3 };
      const max = Math.max(0, ...Object.values(ctx.authorBookCounts));
      return { current: max, target: 3 };
    },
  },

  // ── Exploration: Genre Explorer (3 tiers) ───────────────────────────────
  {
    id: 'genre_explorer_bronze',
    name: 'Genre Explorer',
    tier: 'bronze',
    category: 'exploration',
    description: 'Read books from 3 different genres',
    unlockMessage: 'Three genres explored! Your reading world is expanding.',
    icon: 'compass',
    evaluate: (stats) => (stats.genresRead?.length || 0) >= 3,
    progress: (stats) => ({ current: stats.genresRead?.length || 0, target: 3 }),
  },
  {
    id: 'genre_explorer_silver',
    name: 'Genre Explorer',
    tier: 'silver',
    category: 'exploration',
    description: 'Read books from 5 different genres',
    unlockMessage: "Five genres! You're a true explorer of stories.",
    icon: 'compass',
    evaluate: (stats) => (stats.genresRead?.length || 0) >= 5,
    progress: (stats) => ({ current: stats.genresRead?.length || 0, target: 5 }),
  },
  {
    id: 'genre_explorer_gold',
    name: 'Genre Explorer',
    tier: 'gold',
    category: 'exploration',
    description: 'Read books from 7 different genres',
    unlockMessage: "Seven genres! You've discovered so many kinds of stories.",
    icon: 'compass',
    evaluate: (stats) => (stats.genresRead?.length || 0) >= 7,
    progress: (stats) => ({ current: stats.genresRead?.length || 0, target: 7 }),
  },

  // ── Exploration: Fiction & Fact ─────────────────────────────────────────
  {
    id: 'fiction_and_fact',
    name: 'Fiction & Fact',
    tier: 'single',
    category: 'exploration',
    description: 'Read both fiction and non-fiction books',
    unlockMessage: 'Stories and facts — you enjoy both! A well-rounded reader.',
    icon: 'compass',
    evaluate: (stats) => stats.fictionCount >= 1 && stats.nonfictionCount >= 1,
    progress: (stats) => ({
      current: Math.min(stats.fictionCount, 1) + Math.min(stats.nonfictionCount, 1),
      target: 2,
    }),
  },

  // ── Secret: Bookworm Bonanza (batch) ────────────────────────────────────
  {
    id: 'bookworm_bonanza',
    name: 'Bookworm Bonanza',
    tier: 'single',
    category: 'secret',
    description: 'Log 3 or more reading sessions in a single day',
    unlockMessage: "Three sessions in one day! You couldn't put the books down!",
    icon: 'hidden',
    isSecret: true,
    evaluate: (_stats, ctx) => {
      if (!ctx.sessions) return false;
      const dateCounts = {};
      for (const s of ctx.sessions) {
        dateCounts[s.date] = (dateCounts[s.date] || 0) + 1;
      }
      return Object.values(dateCounts).some((count) => count >= 3);
    },
    progress: () => ({ current: 0, target: 1 }),
  },

  // ── Secret: Weekend Reader (batch) ──────────────────────────────────────
  {
    id: 'weekend_reader',
    name: 'Weekend Reader',
    tier: 'single',
    category: 'secret',
    description: 'Read on both Saturday and Sunday of the same weekend',
    unlockMessage: 'Reading all weekend! Your garden grows even on rest days.',
    icon: 'hidden',
    isSecret: true,
    evaluate: (_stats, ctx) => {
      if (!ctx.sessions) return false;
      const dates = new Set(ctx.sessions.map((s) => s.date));
      for (const dateStr of dates) {
        const d = new Date(dateStr);
        const day = d.getUTCDay();
        if (day === 6) {
          const sun = new Date(d);
          sun.setUTCDate(sun.getUTCDate() + 1);
          if (dates.has(sun.toISOString().slice(0, 10))) return true;
        }
      }
      return false;
    },
    progress: () => ({ current: 0, target: 1 }),
  },
];

// ── Query helpers ───────────────────────────────────────────────────────────

export const getBadgesByCategory = (category) =>
  BADGE_DEFINITIONS.filter((b) => b.category === category);

export const getRealtimeBadges = () =>
  BADGE_DEFINITIONS.filter((b) => REALTIME_CATEGORIES.includes(b.category));

export const getBatchBadges = () =>
  BADGE_DEFINITIONS.filter((b) => !REALTIME_CATEGORIES.includes(b.category));
