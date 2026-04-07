# Badge & Achievement System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a student badge and achievement system with a "reading garden" visual theme, hybrid real-time/batch evaluation, and teacher-focused near-miss indicators.

**Architecture:** Denormalized `student_reading_stats` table aggregates session data for cheap badge evaluation. Code-defined badge definitions with `evaluate()`/`progress()` functions. Real-time evaluation on session CRUD for instant unlock moments; nightly batch cron for exploration/secret badges. Garden header SVG evolves through 4 stages based on total badges earned.

**Tech Stack:** D1 (migration), Hono routes, React 19 + MUI v7, SVG components, Vitest

**Spec:** `docs/superpowers/specs/2026-04-07-badge-achievement-system-design.md`

---

## Chunk 1: Data Layer

### Task 1: Database Migration

**Files:**
- Create: `migrations/0046_badge_system.sql`

- [ ] **Step 1: Write migration file**

```sql
-- Migration 0046: Badge & Achievement System
-- ============================================
-- Two new tables: student_reading_stats (aggregated counters) and
-- student_badges (earned badge records).

-- ── Aggregated reading stats per student ────────────────────────────────────

CREATE TABLE IF NOT EXISTS student_reading_stats (
    student_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    total_books INTEGER DEFAULT 0,
    total_sessions INTEGER DEFAULT 0,
    total_minutes INTEGER DEFAULT 0,
    total_pages INTEGER DEFAULT 0,
    genres_read TEXT DEFAULT '[]',
    unique_authors_count INTEGER DEFAULT 0,
    fiction_count INTEGER DEFAULT 0,
    nonfiction_count INTEGER DEFAULT 0,
    poetry_count INTEGER DEFAULT 0,
    days_read_this_week INTEGER DEFAULT 0,
    days_read_this_term INTEGER DEFAULT 0,
    days_read_this_month INTEGER DEFAULT 0,
    weeks_with_4plus_days INTEGER DEFAULT 0,
    weeks_with_reading INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_reading_stats_org ON student_reading_stats(organization_id);

-- ── Earned badges ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS student_badges (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    badge_id TEXT NOT NULL,
    tier TEXT NOT NULL,
    earned_at TEXT DEFAULT (datetime('now')),
    notified INTEGER DEFAULT 0,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_badges_student ON student_badges(student_id);
CREATE INDEX IF NOT EXISTS idx_badges_org ON student_badges(organization_id);
```

- [ ] **Step 2: Apply migration locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`
Expected: Migration 0046 applied successfully.

- [ ] **Step 3: Verify tables exist**

Run: `npx wrangler d1 execute reading-manager-db --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('student_reading_stats','student_badges')"`
Expected: Both table names returned.

- [ ] **Step 4: Commit**

```bash
git add migrations/0046_badge_system.sql
git commit -m "feat(badges): add student_reading_stats and student_badges tables"
```

---

### Task 2: Row Mappers

**Files:**
- Modify: `src/utils/rowMappers.js:200-213` (append before end)
- Test: `src/__tests__/unit/rowMappers.badge.test.js`

- [ ] **Step 1: Write failing tests for rowToBadge and rowToReadingStats**

Create `src/__tests__/unit/rowMappers.badge.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { rowToBadge, rowToReadingStats } from '../../utils/rowMappers.js';

describe('rowToBadge', () => {
  it('maps a D1 row to a badge object', () => {
    const row = {
      id: 'badge-1',
      student_id: 'stu-1',
      organization_id: 'org-1',
      badge_id: 'bookworm_bronze',
      tier: 'bronze',
      earned_at: '2026-04-07T10:00:00Z',
      notified: 0,
    };
    const result = rowToBadge(row);
    expect(result).toEqual({
      id: 'badge-1',
      studentId: 'stu-1',
      organizationId: 'org-1',
      badgeId: 'bookworm_bronze',
      tier: 'bronze',
      earnedAt: '2026-04-07T10:00:00Z',
      notified: false,
    });
  });

  it('returns null for null row', () => {
    expect(rowToBadge(null)).toBeNull();
  });
});

describe('rowToReadingStats', () => {
  it('maps a D1 row to a reading stats object', () => {
    const row = {
      student_id: 'stu-1',
      organization_id: 'org-1',
      total_books: 7,
      total_sessions: 12,
      total_minutes: 340,
      total_pages: 450,
      genres_read: '["genre-adventure","genre-poetry"]',
      unique_authors_count: 5,
      fiction_count: 6,
      nonfiction_count: 1,
      poetry_count: 0,
      days_read_this_week: 3,
      days_read_this_term: 20,
      days_read_this_month: 8,
      weeks_with_4plus_days: 2,
      weeks_with_reading: 5,
      updated_at: '2026-04-07T10:00:00Z',
    };
    const result = rowToReadingStats(row);
    expect(result).toEqual({
      studentId: 'stu-1',
      organizationId: 'org-1',
      totalBooks: 7,
      totalSessions: 12,
      totalMinutes: 340,
      totalPages: 450,
      genresRead: ['genre-adventure', 'genre-poetry'],
      uniqueAuthorsCount: 5,
      fictionCount: 6,
      nonfictionCount: 1,
      poetryCount: 0,
      daysReadThisWeek: 3,
      daysReadThisTerm: 20,
      daysReadThisMonth: 8,
      weeksWith4PlusDays: 2,
      weeksWithReading: 5,
      updatedAt: '2026-04-07T10:00:00Z',
    });
  });

  it('returns null for null row', () => {
    expect(rowToReadingStats(null)).toBeNull();
  });

  it('parses empty genres_read as empty array', () => {
    const row = {
      student_id: 'stu-1',
      organization_id: 'org-1',
      total_books: 0,
      total_sessions: 0,
      total_minutes: 0,
      total_pages: 0,
      genres_read: '[]',
      unique_authors_count: 0,
      fiction_count: 0,
      nonfiction_count: 0,
      poetry_count: 0,
      days_read_this_week: 0,
      days_read_this_term: 0,
      days_read_this_month: 0,
      weeks_with_4plus_days: 0,
      weeks_with_reading: 0,
      updated_at: null,
    };
    expect(rowToReadingStats(row).genresRead).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/unit/rowMappers.badge.test.js`
Expected: FAIL — `rowToBadge` and `rowToReadingStats` are not exported.

- [ ] **Step 3: Implement row mappers**

Add to `src/utils/rowMappers.js` before the closing of the file (after the `rowToTourCompletion` export):

```js
// ── Badges ──────────────────────────────────────────────────────────────────

export const rowToBadge = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    studentId: row.student_id,
    organizationId: row.organization_id,
    badgeId: row.badge_id,
    tier: row.tier,
    earnedAt: row.earned_at,
    notified: Boolean(row.notified),
  };
};

// ── Reading Stats ───────────────────────────────────────────────────────────

export const rowToReadingStats = (row) => {
  if (!row) return null;
  return {
    studentId: row.student_id,
    organizationId: row.organization_id,
    totalBooks: row.total_books || 0,
    totalSessions: row.total_sessions || 0,
    totalMinutes: row.total_minutes || 0,
    totalPages: row.total_pages || 0,
    genresRead: safeJsonParse(row.genres_read, []),
    uniqueAuthorsCount: row.unique_authors_count || 0,
    fictionCount: row.fiction_count || 0,
    nonfictionCount: row.nonfiction_count || 0,
    poetryCount: row.poetry_count || 0,
    daysReadThisWeek: row.days_read_this_week || 0,
    daysReadThisTerm: row.days_read_this_term || 0,
    daysReadThisMonth: row.days_read_this_month || 0,
    weeksWith4PlusDays: row.weeks_with_4plus_days || 0,
    weeksWithReading: row.weeks_with_reading || 0,
    updatedAt: row.updated_at,
  };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/unit/rowMappers.badge.test.js`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/rowMappers.js src/__tests__/unit/rowMappers.badge.test.js
git commit -m "feat(badges): add rowToBadge and rowToReadingStats mappers"
```

---

## Chunk 2: Badge Definitions & Engine

### Task 3: Badge Definitions

**Files:**
- Create: `src/utils/badgeDefinitions.js`
- Test: `src/__tests__/unit/badgeDefinitions.test.js`

- [ ] **Step 1: Write failing tests for badge definitions**

Create `src/__tests__/unit/badgeDefinitions.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  BADGE_DEFINITIONS,
  getBadgesByCategory,
  getRealtimeBadges,
  getBatchBadges,
  resolveKeyStage,
} from '../../utils/badgeDefinitions.js';

describe('resolveKeyStage', () => {
  it('maps Reception to KS1', () => {
    expect(resolveKeyStage('Reception')).toBe('KS1');
  });
  it('maps Y1, Y2 to KS1', () => {
    expect(resolveKeyStage('Y1')).toBe('KS1');
    expect(resolveKeyStage('Y2')).toBe('KS1');
  });
  it('maps Y3, Y4 to LowerKS2', () => {
    expect(resolveKeyStage('Y3')).toBe('LowerKS2');
    expect(resolveKeyStage('Y4')).toBe('LowerKS2');
  });
  it('maps Y5, Y6 to UpperKS2', () => {
    expect(resolveKeyStage('Y5')).toBe('UpperKS2');
    expect(resolveKeyStage('Y6')).toBe('UpperKS2');
  });
  it('falls back to LowerKS2 for null', () => {
    expect(resolveKeyStage(null)).toBe('LowerKS2');
  });
  it('falls back to LowerKS2 for unrecognised value', () => {
    expect(resolveKeyStage('Year 3')).toBe('LowerKS2');
  });
});

describe('BADGE_DEFINITIONS', () => {
  it('has 18 badge definitions', () => {
    expect(BADGE_DEFINITIONS).toHaveLength(18);
  });

  it('every badge has required fields', () => {
    for (const badge of BADGE_DEFINITIONS) {
      expect(badge).toHaveProperty('id');
      expect(badge).toHaveProperty('name');
      expect(badge).toHaveProperty('tier');
      expect(badge).toHaveProperty('category');
      expect(badge).toHaveProperty('description');
      expect(badge).toHaveProperty('unlockMessage');
      expect(badge).toHaveProperty('icon');
      expect(badge).toHaveProperty('evaluate');
      expect(badge).toHaveProperty('progress');
      expect(typeof badge.evaluate).toBe('function');
      expect(typeof badge.progress).toBe('function');
    }
  });
});

describe('Bookworm badges — volume', () => {
  const bookwormBronze = () => BADGE_DEFINITIONS.find((b) => b.id === 'bookworm_bronze');

  it('evaluates true when KS1 student has 5 books', () => {
    const stats = { totalBooks: 5 };
    const context = { keyStage: 'KS1' };
    expect(bookwormBronze().evaluate(stats, context)).toBe(true);
  });

  it('evaluates false when KS1 student has 4 books', () => {
    const stats = { totalBooks: 4 };
    const context = { keyStage: 'KS1' };
    expect(bookwormBronze().evaluate(stats, context)).toBe(false);
  });

  it('uses LowerKS2 threshold (8) for that key stage', () => {
    const stats = { totalBooks: 7 };
    const context = { keyStage: 'LowerKS2' };
    expect(bookwormBronze().evaluate(stats, context)).toBe(false);
    expect(bookwormBronze().evaluate({ totalBooks: 8 }, context)).toBe(true);
  });

  it('reports correct progress', () => {
    const stats = { totalBooks: 3 };
    const context = { keyStage: 'KS1' };
    expect(bookwormBronze().progress(stats, context)).toEqual({ current: 3, target: 5 });
  });
});

describe('Steady Reader — consistency', () => {
  const steadyReader = () => BADGE_DEFINITIONS.find((b) => b.id === 'steady_reader');

  it('evaluates true when 3+ days read this week', () => {
    const stats = { daysReadThisWeek: 3 };
    expect(steadyReader().evaluate(stats, {})).toBe(true);
  });

  it('evaluates false when fewer than 3 days', () => {
    const stats = { daysReadThisWeek: 2 };
    expect(steadyReader().evaluate(stats, {})).toBe(false);
  });
});

describe('First Finish — milestone', () => {
  const firstFinish = () => BADGE_DEFINITIONS.find((b) => b.id === 'first_finish');

  it('evaluates true when at least 1 book', () => {
    const stats = { totalBooks: 1 };
    expect(firstFinish().evaluate(stats, {})).toBe(true);
  });

  it('evaluates false with 0 books', () => {
    const stats = { totalBooks: 0 };
    expect(firstFinish().evaluate(stats, {})).toBe(false);
  });
});

describe('Genre Explorer — exploration', () => {
  const genreExplorerBronze = () => BADGE_DEFINITIONS.find((b) => b.id === 'genre_explorer_bronze');

  it('evaluates true when 3+ genres', () => {
    const stats = { genresRead: ['a', 'b', 'c'] };
    expect(genreExplorerBronze().evaluate(stats, {})).toBe(true);
  });

  it('evaluates false when 2 genres', () => {
    const stats = { genresRead: ['a', 'b'] };
    expect(genreExplorerBronze().evaluate(stats, {})).toBe(false);
  });
});

describe('Fiction & Fact — exploration', () => {
  const fictionFact = () => BADGE_DEFINITIONS.find((b) => b.id === 'fiction_and_fact');

  it('evaluates true when both fiction and nonfiction read', () => {
    const stats = { fictionCount: 1, nonfictionCount: 1 };
    expect(fictionFact().evaluate(stats, {})).toBe(true);
  });

  it('evaluates false when only fiction read', () => {
    const stats = { fictionCount: 3, nonfictionCount: 0 };
    expect(fictionFact().evaluate(stats, {})).toBe(false);
  });
});

describe('getRealtimeBadges / getBatchBadges', () => {
  it('splits badges into real-time and batch categories', () => {
    const realtime = getRealtimeBadges();
    const batch = getBatchBadges();
    expect(realtime.length + batch.length).toBe(BADGE_DEFINITIONS.length);
    // Monthly Marvel, Series Finisher, secrets should be batch
    expect(batch.find((b) => b.id === 'monthly_marvel')).toBeDefined();
    expect(batch.find((b) => b.id === 'series_finisher')).toBeDefined();
    expect(batch.find((b) => b.id === 'bookworm_bonanza')).toBeDefined();
    expect(batch.find((b) => b.id === 'weekend_reader')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/unit/badgeDefinitions.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement badge definitions**

Create `src/utils/badgeDefinitions.js`:

```js
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
    evaluate: (stats, ctx) => stats.totalBooks >= threshold(ctx.keyStage, { KS1: 5, LowerKS2: 8, UpperKS2: 10 }),
    progress: (stats, ctx) => ({ current: stats.totalBooks, target: threshold(ctx.keyStage, { KS1: 5, LowerKS2: 8, UpperKS2: 10 }) }),
  },
  {
    id: 'bookworm_silver',
    name: 'Bookworm',
    tier: 'silver',
    category: 'volume',
    description: 'A growing collection of books read',
    unlockMessage: "Your reading garden is flourishing! So many stories explored.",
    icon: 'bookworm',
    keyStageThresholds: { KS1: 15, LowerKS2: 25, UpperKS2: 30 },
    evaluate: (stats, ctx) => stats.totalBooks >= threshold(ctx.keyStage, { KS1: 15, LowerKS2: 25, UpperKS2: 30 }),
    progress: (stats, ctx) => ({ current: stats.totalBooks, target: threshold(ctx.keyStage, { KS1: 15, LowerKS2: 25, UpperKS2: 30 }) }),
  },
  {
    id: 'bookworm_gold',
    name: 'Bookworm',
    tier: 'gold',
    category: 'volume',
    description: 'An impressive reading achievement',
    unlockMessage: "What an incredible reader you are! Your garden is blooming beautifully.",
    icon: 'bookworm',
    keyStageThresholds: { KS1: 30, LowerKS2: 50, UpperKS2: 60 },
    evaluate: (stats, ctx) => stats.totalBooks >= threshold(ctx.keyStage, { KS1: 30, LowerKS2: 50, UpperKS2: 60 }),
    progress: (stats, ctx) => ({ current: stats.totalBooks, target: threshold(ctx.keyStage, { KS1: 30, LowerKS2: 50, UpperKS2: 60 }) }),
  },
  {
    id: 'bookworm_star',
    name: 'Bookworm',
    tier: 'star',
    category: 'volume',
    description: 'A truly remarkable reading journey',
    unlockMessage: "A star reader! Your reading garden is a wonder to behold.",
    icon: 'bookworm',
    keyStageThresholds: { KS1: 50, LowerKS2: 80, UpperKS2: 100 },
    evaluate: (stats, ctx) => stats.totalBooks >= threshold(ctx.keyStage, { KS1: 50, LowerKS2: 80, UpperKS2: 100 }),
    progress: (stats, ctx) => ({ current: stats.totalBooks, target: threshold(ctx.keyStage, { KS1: 50, LowerKS2: 80, UpperKS2: 100 }) }),
  },

  // ── Volume: Time Traveller (3 tiers) ───────────────────────────────────
  {
    id: 'time_traveller_bronze',
    name: 'Time Traveller',
    tier: 'bronze',
    category: 'volume',
    description: 'Minutes spent reading',
    unlockMessage: "All that reading time is paying off! Your garden is growing.",
    icon: 'clock',
    keyStageThresholds: { KS1: 200, LowerKS2: 400, UpperKS2: 600 },
    evaluate: (stats, ctx) => stats.totalMinutes >= threshold(ctx.keyStage, { KS1: 200, LowerKS2: 400, UpperKS2: 600 }),
    progress: (stats, ctx) => ({ current: stats.totalMinutes, target: threshold(ctx.keyStage, { KS1: 200, LowerKS2: 400, UpperKS2: 600 }) }),
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
    evaluate: (stats, ctx) => stats.totalMinutes >= threshold(ctx.keyStage, { KS1: 600, LowerKS2: 1200, UpperKS2: 1800 }),
    progress: (stats, ctx) => ({ current: stats.totalMinutes, target: threshold(ctx.keyStage, { KS1: 600, LowerKS2: 1200, UpperKS2: 1800 }) }),
  },
  {
    id: 'time_traveller_gold',
    name: 'Time Traveller',
    tier: 'gold',
    category: 'volume',
    description: 'A truly committed reader',
    unlockMessage: "What a time traveller! Hours upon hours of reading adventures.",
    icon: 'clock',
    keyStageThresholds: { KS1: 1500, LowerKS2: 3000, UpperKS2: 5000 },
    evaluate: (stats, ctx) => stats.totalMinutes >= threshold(ctx.keyStage, { KS1: 1500, LowerKS2: 3000, UpperKS2: 5000 }),
    progress: (stats, ctx) => ({ current: stats.totalMinutes, target: threshold(ctx.keyStage, { KS1: 1500, LowerKS2: 3000, UpperKS2: 5000 }) }),
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
    unlockMessage: "A whole week of reading! Your reading garden is thriving.",
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
    unlockMessage: "A whole month of steady reading! That takes real dedication.",
    icon: 'sun',
    evaluate: (stats) => {
      // Need at least 4 weeks of data and all weeks must have 4+ days
      return stats.weeksWith4PlusDays >= 4;
    },
    progress: (stats) => ({ current: stats.weeksWith4PlusDays, target: 4 }),
  },

  // ── Milestone: First Finish ─────────────────────────────────────────────
  {
    id: 'first_finish',
    name: 'First Finish',
    tier: 'single',
    category: 'milestone',
    description: 'Log your first book',
    unlockMessage: "Your very first book! Every reading garden starts with a single seed.",
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
    // Evaluated in batch — needs session+book join to count per-author
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
    unlockMessage: "Three genres explored! Your reading world is expanding.",
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
    unlockMessage: "Stories and facts — you enjoy both! A well-rounded reader.",
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
    progress: () => ({ current: 0, target: 1 }), // Secret — no progress shown
  },

  // ── Secret: Weekend Reader (batch) ──────────────────────────────────────
  {
    id: 'weekend_reader',
    name: 'Weekend Reader',
    tier: 'single',
    category: 'secret',
    description: 'Read on both Saturday and Sunday of the same weekend',
    unlockMessage: "Reading all weekend! Your garden grows even on rest days.",
    icon: 'hidden',
    isSecret: true,
    evaluate: (_stats, ctx) => {
      if (!ctx.sessions) return false;
      const dates = new Set(ctx.sessions.map((s) => s.date));
      for (const dateStr of dates) {
        const d = new Date(dateStr);
        const day = d.getUTCDay();
        if (day === 6) {
          // Saturday — check if Sunday exists
          const sun = new Date(d);
          sun.setUTCDate(sun.getUTCDate() + 1);
          if (dates.has(sun.toISOString().slice(0, 10))) return true;
        }
      }
      return false;
    },
    progress: () => ({ current: 0, target: 1 }), // Secret — no progress shown
  },
];

// ── Query helpers ───────────────────────────────────────────────────────────

export const getBadgesByCategory = (category) =>
  BADGE_DEFINITIONS.filter((b) => b.category === category);

export const getRealtimeBadges = () =>
  BADGE_DEFINITIONS.filter((b) => REALTIME_CATEGORIES.includes(b.category));

export const getBatchBadges = () =>
  BADGE_DEFINITIONS.filter((b) => !REALTIME_CATEGORIES.includes(b.category));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/unit/badgeDefinitions.test.js`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/badgeDefinitions.js src/__tests__/unit/badgeDefinitions.test.js
git commit -m "feat(badges): add badge definitions with 18 MVP badges"
```

---

### Task 4: Badge Engine — Stats Calculation

**Files:**
- Create: `src/utils/badgeEngine.js`
- Test: `src/__tests__/unit/badgeEngine.test.js`

- [ ] **Step 1: Write failing tests for recalculateStats and genre classification**

Create `src/__tests__/unit/badgeEngine.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import {
  classifyGenre,
  GENRE_CLASSIFICATION,
  recalculateStats,
} from '../../utils/badgeEngine.js';

describe('classifyGenre', () => {
  it('classifies Adventure as fiction', () => {
    expect(classifyGenre('Adventure')).toBe('fiction');
  });
  it('classifies Non-Fiction as nonfiction', () => {
    expect(classifyGenre('Non-Fiction')).toBe('nonfiction');
  });
  it('classifies Biography as nonfiction', () => {
    expect(classifyGenre('Biography')).toBe('nonfiction');
  });
  it('classifies Poetry as poetry', () => {
    expect(classifyGenre('Poetry')).toBe('poetry');
  });
  it('defaults unknown genres to fiction', () => {
    expect(classifyGenre('Custom School Genre')).toBe('fiction');
  });
});

describe('recalculateStats', () => {
  const mockDb = (sessions, books = [], genres = []) => {
    const results = { results: sessions };
    const bookResults = { results: books };
    const genreResults = { results: genres };
    let callIndex = 0;
    return {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          all: vi.fn(() => {
            callIndex++;
            if (callIndex === 1) return results; // sessions query
            if (callIndex === 2) return bookResults; // books query
            if (callIndex === 3) return genreResults; // genres query
            return { results: [] };
          }),
          run: vi.fn(),
        })),
      })),
      batch: vi.fn((stmts) => stmts.map(() => ({ success: true }))),
    };
  };

  it('returns zero stats for a student with no sessions', async () => {
    const db = mockDb([], [], []);
    const stats = await recalculateStats(db, 'stu-1', 'org-1');
    expect(stats.totalBooks).toBe(0);
    expect(stats.totalSessions).toBe(0);
    expect(stats.totalMinutes).toBe(0);
  });

  it('counts distinct books correctly', async () => {
    const sessions = [
      { session_date: '2026-04-01', book_id: 'b1', duration_minutes: 15, pages_read: 10, notes: '' },
      { session_date: '2026-04-02', book_id: 'b1', duration_minutes: 20, pages_read: 15, notes: '' },
      { session_date: '2026-04-03', book_id: 'b2', duration_minutes: 10, pages_read: 5, notes: '' },
    ];
    const db = mockDb(sessions, [], []);
    const stats = await recalculateStats(db, 'stu-1', 'org-1');
    expect(stats.totalBooks).toBe(2);
    expect(stats.totalSessions).toBe(3);
    expect(stats.totalMinutes).toBe(45);
    expect(stats.totalPages).toBe(30);
  });

  it('excludes marker sessions from day counts', async () => {
    const sessions = [
      { session_date: '2026-04-01', book_id: 'b1', duration_minutes: 15, pages_read: 10, notes: '' },
      { session_date: '2026-04-02', book_id: null, duration_minutes: null, pages_read: null, notes: '[ABSENT]' },
    ];
    const db = mockDb(sessions, [], []);
    const stats = await recalculateStats(db, 'stu-1', 'org-1');
    // ABSENT session should not count as a reading day or a book
    expect(stats.totalBooks).toBe(1);
    expect(stats.totalSessions).toBe(2); // all sessions counted
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/unit/badgeEngine.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement badge engine — genre classification and recalculateStats**

Create `src/utils/badgeEngine.js`:

```js
/**
 * Badge engine — stats calculation, real-time evaluation, and batch evaluation.
 *
 * recalculateStats(db, studentId, orgId) — full rebuild from sessions
 * evaluateRealTime(db, studentId, orgId, yearGroup) — check real-time badges
 * evaluateBatch(db, studentId, orgId, yearGroup) — check batch badges
 */

import { generateId } from './helpers.js';
import { resolveKeyStage, getRealtimeBadges, getBatchBadges, BADGE_DEFINITIONS } from './badgeDefinitions.js';

// ── Genre Classification ────────────────────────────────────────────────────

export const GENRE_CLASSIFICATION = {
  Adventure: 'fiction',
  Fantasy: 'fiction',
  Mystery: 'fiction',
  'Science Fiction': 'fiction',
  'Realistic Fiction': 'fiction',
  'Historical Fiction': 'fiction',
  Humor: 'fiction',
  'Animal Stories': 'fiction',
  'Fairy Tales': 'fiction',
  'Graphic Novels': 'fiction',
  'Horror/Scary': 'fiction',
  Sports: 'fiction',
  'Non-Fiction': 'nonfiction',
  Biography: 'nonfiction',
  Poetry: 'poetry',
};

export const classifyGenre = (genreName) => GENRE_CLASSIFICATION[genreName] || 'fiction';

// ── Stats Calculation ───────────────────────────────────────────────────────

const isMarkerSession = (notes) =>
  notes && (notes.includes('[ABSENT]') || notes.includes('[NO_RECORD]'));

export async function recalculateStats(db, studentId, organizationId) {
  // Fetch all sessions for the student
  const sessionsResult = await db
    .prepare(
      `SELECT rs.session_date, rs.book_id, rs.duration_minutes, rs.pages_read, rs.notes
       FROM reading_sessions rs
       WHERE rs.student_id = ?
       ORDER BY rs.session_date ASC`
    )
    .bind(studentId)
    .all();
  const sessions = sessionsResult.results || [];

  // Fetch book details for genre/author info
  const booksResult = await db
    .prepare(
      `SELECT DISTINCT b.id, b.author, b.genre_ids
       FROM books b
       INNER JOIN reading_sessions rs ON rs.book_id = b.id
       WHERE rs.student_id = ?`
    )
    .bind(studentId)
    .all();
  const books = booksResult.results || [];
  const bookMap = new Map(books.map((b) => [b.id, b]));

  // Fetch genre names for classification
  const genresResult = await db
    .prepare(`SELECT id, name FROM genres`)
    .bind()
    .all();
  const genreNameMap = new Map((genresResult.results || []).map((g) => [g.id, g.name]));

  // Calculate aggregate stats
  const bookIds = new Set();
  const readingDates = new Set(); // dates with real reading (not markers)
  let totalSessions = 0;
  let totalMinutes = 0;
  let totalPages = 0;
  const genreIdSet = new Set();
  const authorSet = new Set();
  let fictionCount = 0;
  let nonfictionCount = 0;
  let poetryCount = 0;

  for (const s of sessions) {
    totalSessions++;
    totalMinutes += s.duration_minutes || 0;
    totalPages += s.pages_read || 0;

    if (!isMarkerSession(s.notes)) {
      readingDates.add(s.session_date);

      if (s.book_id && !bookIds.has(s.book_id)) {
        bookIds.add(s.book_id);
        const book = bookMap.get(s.book_id);
        if (book) {
          if (book.author) authorSet.add(book.author);
          // Parse genre_ids JSON and classify (per-book, not per-genre)
          try {
            const gids = JSON.parse(book.genre_ids || '[]');
            const bookTypes = new Set();
            for (const gid of gids) {
              genreIdSet.add(gid);
              const gname = genreNameMap.get(gid);
              if (gname) bookTypes.add(classifyGenre(gname));
            }
            // Count once per book per type
            if (bookTypes.has('fiction')) fictionCount++;
            if (bookTypes.has('nonfiction')) nonfictionCount++;
            if (bookTypes.has('poetry')) poetryCount++;
          } catch {
            // ignore bad JSON
          }
        }
      }
    }
  }

  // Time-window calculations
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth(); // 0-indexed
  const datesArray = [...readingDates].sort();

  // Days read this week (Mon-Sun containing today)
  const todayDate = now.toISOString().slice(0, 10);
  const todayDay = now.getUTCDay(); // 0=Sun
  const mondayOffset = todayDay === 0 ? -6 : 1 - todayDay;
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() + mondayOffset);
  const mondayStr = monday.toISOString().slice(0, 10);
  const sundayEnd = new Date(monday);
  sundayEnd.setUTCDate(sundayEnd.getUTCDate() + 6);
  const sundayStr = sundayEnd.toISOString().slice(0, 10);
  const daysReadThisWeek = datesArray.filter((d) => d >= mondayStr && d <= sundayStr).length;

  // Days read this month
  const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
  const nextMonth = currentMonth === 11 ? `${currentYear + 1}-01-01` : `${currentYear}-${String(currentMonth + 2).padStart(2, '0')}-01`;
  const daysReadThisMonth = datesArray.filter((d) => d >= monthStart && d < nextMonth).length;

  // Weeks with 4+ days this month
  const weekBuckets = {};
  for (const d of datesArray.filter((d) => d >= monthStart && d < nextMonth)) {
    const dt = new Date(d);
    const dayOfWeek = dt.getUTCDay();
    const weekMondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekMonday = new Date(dt);
    weekMonday.setUTCDate(weekMonday.getUTCDate() + weekMondayOffset);
    const weekKey = weekMonday.toISOString().slice(0, 10);
    weekBuckets[weekKey] = (weekBuckets[weekKey] || 0) + 1;
  }
  const weeksWith4PlusDays = Object.values(weekBuckets).filter((c) => c >= 4).length;

  // Days read this term and weeks with reading (use full dataset for term — simplified to calendar year term)
  // For MVP, "term" = current academic term. We use all dates in the dataset for now.
  const daysReadThisTerm = datesArray.length;
  const termWeekBuckets = {};
  for (const d of datesArray) {
    const dt = new Date(d);
    const dayOfWeek = dt.getUTCDay();
    const weekMondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekMonday = new Date(dt);
    weekMonday.setUTCDate(weekMonday.getUTCDate() + weekMondayOffset);
    const weekKey = weekMonday.toISOString().slice(0, 10);
    termWeekBuckets[weekKey] = true;
  }
  const weeksWithReading = Object.keys(termWeekBuckets).length;

  const stats = {
    totalBooks: bookIds.size,
    totalSessions,
    totalMinutes,
    totalPages,
    genresRead: [...genreIdSet],
    uniqueAuthorsCount: authorSet.size,
    fictionCount,
    nonfictionCount,
    poetryCount,
    daysReadThisWeek,
    daysReadThisTerm,
    daysReadThisMonth,
    weeksWith4PlusDays,
    weeksWithReading,
  };

  // Upsert into student_reading_stats
  await db
    .prepare(
      `INSERT INTO student_reading_stats (
        student_id, organization_id, total_books, total_sessions, total_minutes, total_pages,
        genres_read, unique_authors_count, fiction_count, nonfiction_count, poetry_count,
        days_read_this_week, days_read_this_term, days_read_this_month,
        weeks_with_4plus_days, weeks_with_reading, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(student_id) DO UPDATE SET
        organization_id = excluded.organization_id,
        total_books = excluded.total_books,
        total_sessions = excluded.total_sessions,
        total_minutes = excluded.total_minutes,
        total_pages = excluded.total_pages,
        genres_read = excluded.genres_read,
        unique_authors_count = excluded.unique_authors_count,
        fiction_count = excluded.fiction_count,
        nonfiction_count = excluded.nonfiction_count,
        poetry_count = excluded.poetry_count,
        days_read_this_week = excluded.days_read_this_week,
        days_read_this_term = excluded.days_read_this_term,
        days_read_this_month = excluded.days_read_this_month,
        weeks_with_4plus_days = excluded.weeks_with_4plus_days,
        weeks_with_reading = excluded.weeks_with_reading,
        updated_at = datetime('now')`
    )
    .bind(
      studentId,
      organizationId,
      stats.totalBooks,
      stats.totalSessions,
      stats.totalMinutes,
      stats.totalPages,
      JSON.stringify(stats.genresRead),
      stats.uniqueAuthorsCount,
      stats.fictionCount,
      stats.nonfictionCount,
      stats.poetryCount,
      stats.daysReadThisWeek,
      stats.daysReadThisTerm,
      stats.daysReadThisMonth,
      stats.weeksWith4PlusDays,
      stats.weeksWithReading
    )
    .run();

  return stats;
}

// ── Real-time Evaluation ────────────────────────────────────────────────────

export async function evaluateRealTime(db, studentId, organizationId, yearGroup) {
  // Load current stats
  const statsRow = await db
    .prepare('SELECT * FROM student_reading_stats WHERE student_id = ?')
    .bind(studentId)
    .first();
  if (!statsRow) return [];

  const stats = {
    totalBooks: statsRow.total_books || 0,
    totalSessions: statsRow.total_sessions || 0,
    totalMinutes: statsRow.total_minutes || 0,
    totalPages: statsRow.total_pages || 0,
    genresRead: JSON.parse(statsRow.genres_read || '[]'),
    uniqueAuthorsCount: statsRow.unique_authors_count || 0,
    fictionCount: statsRow.fiction_count || 0,
    nonfictionCount: statsRow.nonfiction_count || 0,
    poetryCount: statsRow.poetry_count || 0,
    daysReadThisWeek: statsRow.days_read_this_week || 0,
    daysReadThisTerm: statsRow.days_read_this_term || 0,
    daysReadThisMonth: statsRow.days_read_this_month || 0,
    weeksWith4PlusDays: statsRow.weeks_with_4plus_days || 0,
    weeksWithReading: statsRow.weeks_with_reading || 0,
  };

  // Load already-earned badge IDs
  const earnedResult = await db
    .prepare('SELECT badge_id FROM student_badges WHERE student_id = ?')
    .bind(studentId)
    .all();
  const earnedBadgeIds = new Set((earnedResult.results || []).map((r) => r.badge_id));

  const keyStage = resolveKeyStage(yearGroup);
  const context = { keyStage, earnedBadgeIds, currentDate: new Date().toISOString().slice(0, 10) };

  const newBadges = [];
  for (const badge of getRealtimeBadges()) {
    if (earnedBadgeIds.has(badge.id)) continue;
    if (badge.evaluate(stats, context)) {
      const badgeRecord = {
        id: generateId(),
        studentId,
        organizationId,
        badgeId: badge.id,
        tier: badge.tier,
      };
      await db
        .prepare(
          `INSERT INTO student_badges (id, student_id, organization_id, badge_id, tier)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(badgeRecord.id, studentId, organizationId, badge.id, badge.tier)
        .run();
      newBadges.push({
        id: badge.id,
        name: badge.name,
        tier: badge.tier,
        unlockMessage: badge.unlockMessage,
        icon: badge.icon,
      });
    }
  }

  return newBadges;
}

// ── Batch Evaluation ────────────────────────────────────────────────────────

export async function evaluateBatch(db, studentId, organizationId, yearGroup) {
  const statsRow = await db
    .prepare('SELECT * FROM student_reading_stats WHERE student_id = ?')
    .bind(studentId)
    .first();
  if (!statsRow) return [];

  const stats = {
    totalBooks: statsRow.total_books || 0,
    totalSessions: statsRow.total_sessions || 0,
    totalMinutes: statsRow.total_minutes || 0,
    totalPages: statsRow.total_pages || 0,
    genresRead: JSON.parse(statsRow.genres_read || '[]'),
    uniqueAuthorsCount: statsRow.unique_authors_count || 0,
    fictionCount: statsRow.fiction_count || 0,
    nonfictionCount: statsRow.nonfiction_count || 0,
    poetryCount: statsRow.poetry_count || 0,
    daysReadThisWeek: statsRow.days_read_this_week || 0,
    daysReadThisTerm: statsRow.days_read_this_term || 0,
    daysReadThisMonth: statsRow.days_read_this_month || 0,
    weeksWith4PlusDays: statsRow.weeks_with_4plus_days || 0,
    weeksWithReading: statsRow.weeks_with_reading || 0,
  };

  // Load already-earned badge IDs
  const earnedResult = await db
    .prepare('SELECT badge_id FROM student_badges WHERE student_id = ?')
    .bind(studentId)
    .all();
  const earnedBadgeIds = new Set((earnedResult.results || []).map((r) => r.badge_id));

  // Load sessions for session-level badges (secret badges)
  const sessionsResult = await db
    .prepare(
      `SELECT session_date as date, notes FROM reading_sessions
       WHERE student_id = ? AND notes NOT LIKE '%[ABSENT]%' AND notes NOT LIKE '%[NO_RECORD]%'
       ORDER BY session_date DESC`
    )
    .bind(studentId)
    .all();
  const sessions = sessionsResult.results || [];

  // Load per-author book counts for Series Finisher
  const authorResult = await db
    .prepare(
      `SELECT b.author, COUNT(DISTINCT b.id) as book_count
       FROM reading_sessions rs
       INNER JOIN books b ON rs.book_id = b.id
       WHERE rs.student_id = ? AND b.author IS NOT NULL AND b.author != ''
       GROUP BY b.author`
    )
    .bind(studentId)
    .all();
  const authorBookCounts = {};
  for (const r of (authorResult.results || [])) {
    authorBookCounts[r.author] = r.book_count;
  }

  const keyStage = resolveKeyStage(yearGroup);
  const context = {
    keyStage,
    earnedBadgeIds,
    currentDate: new Date().toISOString().slice(0, 10),
    sessions,
    authorBookCounts,
  };

  const newBadges = [];
  for (const badge of getBatchBadges()) {
    if (earnedBadgeIds.has(badge.id)) continue;
    if (badge.evaluate(stats, context)) {
      const badgeRecord = {
        id: generateId(),
        studentId,
        organizationId,
        badgeId: badge.id,
        tier: badge.tier,
      };
      await db
        .prepare(
          `INSERT INTO student_badges (id, student_id, organization_id, badge_id, tier)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(badgeRecord.id, studentId, organizationId, badge.id, badge.tier)
        .run();
      newBadges.push({
        id: badge.id,
        name: badge.name,
        tier: badge.tier,
      });
    }
  }

  return newBadges;
}

// ── Near-Miss Calculation ───────────────────────────────────────────────────

export function calculateNearMisses(stats, yearGroup, earnedBadgeIds) {
  const keyStage = resolveKeyStage(yearGroup);
  const context = { keyStage, earnedBadgeIds };
  const nearMisses = [];

  for (const badge of BADGE_DEFINITIONS) {
    if (earnedBadgeIds.has(badge.id)) continue;
    if (badge.isSecret) continue; // Don't reveal secret badges
    const { current, target } = badge.progress(stats, context);
    if (target > 0 && current / target >= 0.6) {
      nearMisses.push({
        badgeId: badge.id,
        name: badge.name,
        tier: badge.tier,
        current,
        target,
        remaining: target - current,
      });
    }
  }

  // Sort by closest to completion, cap at 3
  nearMisses.sort((a, b) => a.remaining / a.target - b.remaining / b.target);
  return nearMisses.slice(0, 3);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/unit/badgeEngine.test.js`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/badgeEngine.js src/__tests__/unit/badgeEngine.test.js
git commit -m "feat(badges): add badge engine with stats calculation and evaluation"
```

---

## Chunk 3: API Layer

### Task 5: Badge Routes

**Files:**
- Create: `src/routes/badges.js`

- [ ] **Step 1: Create badge routes file**

```js
/**
 * Badge routes — GET /api/students/:id/badges, POST /api/students/:id/badges/notify
 *
 * These are registered under /api/badges in worker.js but use student ID params.
 * Alternatively, these could live in students.js — but a separate file keeps
 * the badge logic contained.
 */

import { Hono } from 'hono';
import { requireReadonly, requireTeacher } from '../middleware/tenant.js';
import { requireDB } from '../utils/routeHelpers.js';
import { rowToBadge, rowToReadingStats } from '../utils/rowMappers.js';
import { BADGE_DEFINITIONS, resolveKeyStage } from '../utils/badgeDefinitions.js';
import { calculateNearMisses } from '../utils/badgeEngine.js';

const badgesRouter = new Hono();

/**
 * GET /api/badges/students/:id
 * Full badge collection for a student: earned, progress, near-misses
 */
badgesRouter.get('/students/:id', requireReadonly(), async (c) => {
  const db = requireDB(c.env);
  const organizationId = c.get('organizationId');
  const { id } = c.req.param();

  // Verify student belongs to org
  const student = await db
    .prepare('SELECT id, year_group FROM students WHERE id = ? AND organization_id = ? AND is_active = 1')
    .bind(id, organizationId)
    .first();
  if (!student) {
    return c.json({ error: 'Student not found' }, 404);
  }

  // Fetch earned badges and stats in parallel
  const [badgesResult, statsRow] = await Promise.all([
    db.prepare('SELECT * FROM student_badges WHERE student_id = ? ORDER BY earned_at DESC').bind(id).all(),
    db.prepare('SELECT * FROM student_reading_stats WHERE student_id = ?').bind(id).first(),
  ]);

  const earned = (badgesResult.results || []).map(rowToBadge);
  const stats = statsRow ? rowToReadingStats(statsRow) : null;
  const earnedBadgeIds = new Set(earned.map((b) => b.badgeId));

  // Calculate near-misses
  const nearMisses = stats ? calculateNearMisses(stats, student.year_group, earnedBadgeIds) : [];

  // Build progress for all non-secret, non-earned badges
  const keyStage = resolveKeyStage(student.year_group);
  const context = { keyStage, earnedBadgeIds };
  const allProgress = BADGE_DEFINITIONS
    .filter((b) => !b.isSecret && !earnedBadgeIds.has(b.id))
    .map((b) => ({
      badgeId: b.id,
      name: b.name,
      tier: b.tier,
      category: b.category,
      description: b.description,
      ...b.progress(stats || {}, context),
    }));

  return c.json({ earned, stats, nearMisses, progress: allProgress });
});

/**
 * POST /api/badges/students/:id/notify
 * Mark badge(s) as notified
 */
badgesRouter.post('/students/:id/notify', requireTeacher(), async (c) => {
  const db = requireDB(c.env);
  const organizationId = c.get('organizationId');
  const { id } = c.req.param();
  const { badgeIds } = await c.req.json();

  if (!Array.isArray(badgeIds) || badgeIds.length === 0) {
    return c.json({ error: 'badgeIds array required' }, 400);
  }

  // Update notified flag for matching badges
  const placeholders = badgeIds.map(() => '?').join(',');
  await db
    .prepare(
      `UPDATE student_badges SET notified = 1
       WHERE student_id = ? AND organization_id = ? AND badge_id IN (${placeholders})`
    )
    .bind(id, organizationId, ...badgeIds)
    .run();

  return c.json({ updated: badgeIds.length });
});

export default badgesRouter;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/badges.js
git commit -m "feat(badges): add badge API routes (GET collection, POST notify)"
```

---

### Task 6: Integrate Badge Evaluation into Session Handlers

**Files:**
- Modify: `src/routes/students.js:1364-1394` (session create — after streak update, before return)
- Modify: `src/routes/students.js:1469-1510` (session delete — after streak recalculation)
- Modify: `src/routes/students.js:1618-1657` (session update — after streak recalculation)

- [ ] **Step 1: Add badge imports to students.js**

At the top of `src/routes/students.js`, add alongside existing imports:

```js
import { recalculateStats, evaluateRealTime } from '../utils/badgeEngine.js';
```

- [ ] **Step 2: Add badge evaluation to session CREATE handler**

In `src/routes/students.js`, after the streak update line (`const streakData = await updateStudentStreak(db, id, organizationId, c.env);` at ~line 1365) and before fetching the created session (~line 1367), add:

```js
    // Update reading stats and evaluate badges
    await recalculateStats(db, id, organizationId);
    const newBadges = isMarkerSession ? [] : await evaluateRealTime(db, id, organizationId, student.year_group);
```

Note: Need to fetch `year_group` from the student query. The existing student query at line 1275 only selects `id, processing_restricted`. Update it to also select `year_group`:

Change: `SELECT id, processing_restricted FROM students WHERE id = ? AND organization_id = ? AND is_active = 1`
To: `SELECT id, processing_restricted, year_group FROM students WHERE id = ? AND organization_id = ? AND is_active = 1`

Then modify the return statement (~line 1380) to include `newBadges`:

Change the `return c.json({...}, 201)` to include `newBadges`:
```js
    return c.json(
      {
        id: session.id,
        date: session.session_date,
        bookTitle: session.book_title || session.book_title_manual,
        bookAuthor: session.book_author || session.book_author_manual,
        bookId: session.book_id,
        pagesRead: session.pages_read,
        duration: session.duration_minutes,
        assessment: session.assessment,
        notes: session.notes,
        location: session.location || 'school',
        recordedBy: session.recorded_by,
        newBadges,
      },
      201
    );
```

- [ ] **Step 3: Add badge evaluation to session DELETE handler**

In the DELETE handler (~line 1469, after streak recalculation), add:

```js
    // Recalculate reading stats (badges are not revoked on delete)
    await recalculateStats(db, id, organizationId);
```

- [ ] **Step 4: Add badge evaluation to session UPDATE handler**

In the PUT handler (~line 1618, after streak recalculation), add:

```js
    // Recalculate reading stats and evaluate badges
    await recalculateStats(db, id, organizationId);
    // Fetch year_group for badge evaluation
    const studentForBadges = await db
      .prepare('SELECT year_group FROM students WHERE id = ?')
      .bind(id)
      .first();
    const newBadges = await evaluateRealTime(db, id, organizationId, studentForBadges?.year_group);
```

And include `newBadges` in the PUT response object.

- [ ] **Step 5: Add badges/stats to GET single student handler**

In the GET `/:id` handler (~line 718, after `const result = rowToStudent(student)`), add badge and stats fetching alongside the existing parallel queries. After the sessions fetch and streak calculation (~line 758), add:

```js
    // Fetch badges and reading stats
    const [badgesResult, statsRow] = await Promise.all([
      db.prepare('SELECT * FROM student_badges WHERE student_id = ? ORDER BY earned_at DESC').bind(id).all(),
      db.prepare('SELECT * FROM student_reading_stats WHERE student_id = ?').bind(id).first(),
    ]);
    result.badges = (badgesResult.results || []).map((r) => ({
      badgeId: r.badge_id,
      tier: r.tier,
      earnedAt: r.earned_at,
      notified: Boolean(r.notified),
    }));
    if (statsRow) {
      result.readingStats = rowToReadingStats(statsRow);
    }
    const earnedBadgeIds = new Set(result.badges.map((b) => b.badgeId));
    result.nearMisses = statsRow
      ? calculateNearMisses(rowToReadingStats(statsRow), student.year_group, earnedBadgeIds)
      : [];
```

Add import for `rowToReadingStats` and `calculateNearMisses` (already imported `recalculateStats` and `evaluateRealTime` above).

Update the import line to:
```js
import { recalculateStats, evaluateRealTime, calculateNearMisses } from '../utils/badgeEngine.js';
import { rowToReadingStats } from '../utils/rowMappers.js';
```

- [ ] **Step 6: Commit**

```bash
git add src/routes/students.js
git commit -m "feat(badges): integrate badge evaluation into session CRUD and student GET"
```

---

### Task 7: Register Routes and Cron in Worker

**Files:**
- Modify: `src/worker.js:264-282` (route registration)
- Modify: `src/worker.js:418-450` (cron handler)
- Modify: `wrangler.toml:66-72` (cron triggers)

- [ ] **Step 1: Add badge route import and registration**

In `src/worker.js`, add import alongside other route imports:

```js
import badgesRouter from './routes/badges.js';
```

Add route registration after the existing routes (~line 282):

```js
app.route('/api/badges', badgesRouter);
```

- [ ] **Step 2: Add badge cron handler**

In the `scheduled` handler, after the streak recalculation block (~after the `if (event.cron === '0 2 * * *')` block), add:

```js
      // Badge evaluation at 2:30 AM UTC (after streaks are recalculated)
      if (event.cron === '30 2 * * *') {
        try {
          const { recalculateStats, evaluateBatch } = await import('./utils/badgeEngine.js');

          // Get all active organizations
          const orgs = await db
            .prepare('SELECT id FROM organizations WHERE is_active = 1')
            .bind()
            .all();

          let totalStudents = 0;
          let totalNewBadges = 0;

          for (const org of orgs.results || []) {
            // Get active students with at least one session
            const students = await db
              .prepare(
                `SELECT DISTINCT s.id, s.year_group
                 FROM students s
                 INNER JOIN reading_sessions rs ON rs.student_id = s.id
                 WHERE s.organization_id = ? AND s.is_active = 1`
              )
              .bind(org.id)
              .all();

            for (const student of students.results || []) {
              try {
                await recalculateStats(db, student.id, org.id);
                const newBadges = await evaluateBatch(db, student.id, org.id, student.year_group);
                totalNewBadges += newBadges.length;
                totalStudents++;
              } catch (err) {
                console.error(`[Cron] Badge evaluation error for student ${student.id}:`, err.message);
              }
            }
          }

          console.log(`[Cron] Badge evaluation complete: ${totalStudents} students, ${totalNewBadges} new badges`);
        } catch (error) {
          console.error('[Cron] Badge evaluation failed:', error.message);
        }
      }
```

- [ ] **Step 3: Add cron trigger to wrangler.toml**

In `wrangler.toml`, update the crons array to include `30 2 * * *`:

Change: `crons = ["*/1 * * * *", "0 * * * *", "0 2 * * *", "0 3 * * *"]`
To: `crons = ["*/1 * * * *", "0 * * * *", "0 2 * * *", "30 2 * * *", "0 3 * * *"]`

- [ ] **Step 4: Commit**

```bash
git add src/worker.js wrangler.toml
git commit -m "feat(badges): register badge routes and nightly cron in worker"
```

---

## Chunk 4: Frontend Components

### Task 8: BadgeIcon Component

**Files:**
- Create: `src/components/badges/BadgeIcon.js`

- [ ] **Step 1: Create BadgeIcon component**

```js
import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';

const TIER_GRADIENTS = {
  bronze: 'linear-gradient(135deg, #CD7F32, #A0612A)',
  silver: 'linear-gradient(135deg, #C0C0C0, #8A8A8A)',
  gold: 'linear-gradient(135deg, #FFD700, #DAA520)',
  star: 'linear-gradient(135deg, #9B59B6, #7D3C98)',
  single: 'linear-gradient(135deg, #86A86B, #6B8F50)',
};

const CATEGORY_ICONS = {
  bookworm: '📚',
  clock: '⏱',
  sun: '☀️',
  seedling: '🌱',
  flower: '🌸',
  compass: '🔍',
  hidden: '✨',
};

export default function BadgeIcon({ badge, size = 'medium', showLabel = true }) {
  const sizeMap = { small: 24, medium: 48, large: 64 };
  const px = sizeMap[size] || sizeMap.medium;
  const fontSize = size === 'small' ? 12 : size === 'large' ? 30 : 22;
  const gradient = TIER_GRADIENTS[badge.tier] || TIER_GRADIENTS.single;
  const icon = CATEGORY_ICONS[badge.icon] || '🏆';
  const tierLabel = badge.tier === 'single' ? '' : badge.tier.charAt(0).toUpperCase() + badge.tier.slice(1);

  return (
    <Tooltip title={`${badge.name}${tierLabel ? ` (${tierLabel})` : ''} — ${badge.description || badge.unlockMessage || ''}`}>
      <Box sx={{ textAlign: 'center', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
        <Box
          sx={{
            width: px,
            height: px,
            borderRadius: '50%',
            background: gradient,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize,
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          }}
        >
          {icon}
        </Box>
        {showLabel && size !== 'small' && (
          <>
            <Typography variant="caption" sx={{ mt: 0.5, fontWeight: 500, color: '#3D3427', fontSize: 10, lineHeight: 1.2 }}>
              {badge.name}
            </Typography>
            {tierLabel && (
              <Typography variant="caption" sx={{ color: '#8B7E6A', fontSize: 9 }}>
                {tierLabel}
              </Typography>
            )}
          </>
        )}
      </Box>
    </Tooltip>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/badges/BadgeIcon.js
git commit -m "feat(badges): add BadgeIcon component with tier gradients"
```

---

### Task 9: GardenHeader Component

**Files:**
- Create: `src/components/badges/GardenHeader.js`

- [ ] **Step 1: Create GardenHeader SVG component**

```js
import React from 'react';
import { Box, Typography } from '@mui/material';

const STAGES = [
  { name: 'Seedling', min: 0, max: 2 },
  { name: 'Sprout', min: 3, max: 7 },
  { name: 'Bloom', min: 8, max: 15 },
  { name: 'Full Garden', min: 16, max: Infinity },
];

function getStage(badgeCount) {
  return STAGES.find((s) => badgeCount >= s.min && badgeCount <= s.max) || STAGES[0];
}

function SeedlingSvg() {
  return (
    <svg viewBox="0 0 300 80" width="100%" height="80">
      {/* Ground */}
      <rect x="0" y="60" width="300" height="20" fill="#D4A574" rx="4" />
      <rect x="0" y="55" width="300" height="10" fill="#C49A6C" rx="4" />
      {/* Single seedling */}
      <line x1="150" y1="55" x2="150" y2="35" stroke="#7A9B5A" strokeWidth="2" />
      <ellipse cx="145" cy="32" rx="6" ry="8" fill="#8FB573" transform="rotate(-20,145,32)" />
      <ellipse cx="155" cy="32" rx="6" ry="8" fill="#8FB573" transform="rotate(20,155,32)" />
    </svg>
  );
}

function SproutSvg() {
  return (
    <svg viewBox="0 0 300 80" width="100%" height="80">
      <rect x="0" y="60" width="300" height="20" fill="#D4A574" rx="4" />
      <rect x="0" y="55" width="300" height="10" fill="#C49A6C" rx="4" />
      {/* Small plants */}
      <line x1="80" y1="55" x2="80" y2="30" stroke="#7A9B5A" strokeWidth="2" />
      <ellipse cx="74" cy="28" rx="8" ry="10" fill="#8FB573" transform="rotate(-15,74,28)" />
      <ellipse cx="86" cy="28" rx="8" ry="10" fill="#8FB573" transform="rotate(15,86,28)" />
      <line x1="150" y1="55" x2="150" y2="25" stroke="#6B8F50" strokeWidth="2.5" />
      <ellipse cx="143" cy="22" rx="9" ry="11" fill="#86A86B" transform="rotate(-20,143,22)" />
      <ellipse cx="157" cy="22" rx="9" ry="11" fill="#86A86B" transform="rotate(20,157,22)" />
      <line x1="220" y1="55" x2="220" y2="35" stroke="#7A9B5A" strokeWidth="2" />
      <ellipse cx="215" cy="33" rx="7" ry="9" fill="#8FB573" transform="rotate(-10,215,33)" />
      <ellipse cx="225" cy="33" rx="7" ry="9" fill="#8FB573" transform="rotate(10,225,33)" />
      {/* Butterfly */}
      <ellipse cx="120" cy="20" rx="5" ry="3" fill="#E8B4C8" transform="rotate(-30,120,20)" />
      <ellipse cx="128" cy="20" rx="5" ry="3" fill="#E8B4C8" transform="rotate(30,128,20)" />
      <circle cx="124" cy="22" r="1" fill="#3D3427" />
    </svg>
  );
}

function BloomSvg() {
  return (
    <svg viewBox="0 0 300 80" width="100%" height="80">
      <rect x="0" y="60" width="300" height="20" fill="#D4A574" rx="4" />
      <rect x="0" y="55" width="300" height="10" fill="#B8D4A0" rx="4" />
      {/* Small tree */}
      <rect x="68" y="30" width="4" height="25" fill="#8B6B4A" />
      <circle cx="70" cy="22" r="16" fill="#6B8F50" />
      <circle cx="62" cy="18" r="10" fill="#86A86B" />
      <circle cx="78" cy="18" r="10" fill="#86A86B" />
      {/* Flowers */}
      <line x1="140" y1="55" x2="140" y2="30" stroke="#7A9B5A" strokeWidth="2" />
      <circle cx="140" cy="26" r="5" fill="#E8B4C8" />
      <circle cx="140" cy="26" r="2" fill="#F5D76E" />
      <line x1="170" y1="55" x2="170" y2="35" stroke="#7A9B5A" strokeWidth="2" />
      <circle cx="170" cy="31" r="4" fill="#D4A0D4" />
      <circle cx="170" cy="31" r="1.5" fill="#F5D76E" />
      <line x1="200" y1="55" x2="200" y2="32" stroke="#7A9B5A" strokeWidth="2" />
      <circle cx="200" cy="28" r="5" fill="#F5D76E" />
      <circle cx="200" cy="28" r="2" fill="#CD7F32" />
      {/* Plants */}
      <line x1="240" y1="55" x2="240" y2="35" stroke="#6B8F50" strokeWidth="2" />
      <ellipse cx="235" cy="32" rx="7" ry="9" fill="#86A86B" transform="rotate(-15,235,32)" />
      <ellipse cx="245" cy="32" rx="7" ry="9" fill="#86A86B" transform="rotate(15,245,32)" />
      {/* Bird */}
      <path d="M250,15 Q255,10 260,15 Q255,12 250,15" fill="#8B6B4A" />
    </svg>
  );
}

function FullGardenSvg() {
  return (
    <svg viewBox="0 0 300 80" width="100%" height="80">
      <rect x="0" y="60" width="300" height="20" fill="#C49A6C" rx="4" />
      <rect x="0" y="55" width="300" height="10" fill="#A8D48C" rx="4" />
      {/* Large tree */}
      <rect x="38" y="25" width="5" height="30" fill="#8B6B4A" />
      <circle cx="40" cy="15" r="18" fill="#5A8040" />
      <circle cx="30" cy="10" r="12" fill="#6B8F50" />
      <circle cx="50" cy="10" r="12" fill="#6B8F50" />
      <circle cx="40" cy="5" r="10" fill="#86A86B" />
      {/* Flowers field */}
      {[95, 115, 135, 155, 175].map((x, i) => (
        <React.Fragment key={i}>
          <line x1={x} y1={55} x2={x} y2={30 + (i % 2) * 5} stroke="#7A9B5A" strokeWidth="2" />
          <circle cx={x} cy={26 + (i % 2) * 5} r={4 + (i % 3)} fill={['#E8B4C8', '#F5D76E', '#D4A0D4', '#E8B4C8', '#F5D76E'][i]} />
          <circle cx={x} cy={26 + (i % 2) * 5} r={1.5} fill="#CD7F32" />
        </React.Fragment>
      ))}
      {/* Second tree */}
      <rect x="218" y="30" width="4" height="25" fill="#8B6B4A" />
      <circle cx="220" cy="22" r="14" fill="#6B8F50" />
      <circle cx="212" cy="18" r="9" fill="#86A86B" />
      <circle cx="228" cy="18" r="9" fill="#86A86B" />
      {/* Small creatures */}
      <circle cx="260" cy="52" r="3" fill="#CD7F32" /> {/* Hedgehog body */}
      <circle cx="263" cy="51" r="1" fill="#3D3427" /> {/* Eye */}
      {/* Butterfly */}
      <ellipse cx="85" cy="15" rx="5" ry="3" fill="#E8B4C8" transform="rotate(-30,85,15)" />
      <ellipse cx="93" cy="15" rx="5" ry="3" fill="#D4A0D4" transform="rotate(30,93,15)" />
      {/* Bird */}
      <path d="M270,10 Q275,5 280,10 Q275,7 270,10" fill="#8B6B4A" />
    </svg>
  );
}

const SVG_COMPONENTS = {
  Seedling: SeedlingSvg,
  Sprout: SproutSvg,
  Bloom: BloomSvg,
  'Full Garden': FullGardenSvg,
};

export default function GardenHeader({ badgeCount = 0, studentName = '' }) {
  const stage = getStage(badgeCount);
  const SvgComponent = SVG_COMPONENTS[stage.name];

  return (
    <Box
      sx={{
        background: 'linear-gradient(180deg, #E8F5E2 0%, #F5EFD6 50%, #D4A574 100%)',
        p: 2,
        textAlign: 'center',
        borderRadius: '12px 12px 0 0',
      }}
    >
      <SvgComponent />
      <Typography variant="subtitle2" sx={{ color: '#5D6B4A', fontWeight: 600, mt: 0.5 }}>
        {studentName ? `${studentName}'s Reading Garden` : 'Reading Garden'}
      </Typography>
      <Typography variant="caption" sx={{ color: '#7A8B66' }}>
        {badgeCount} badge{badgeCount !== 1 ? 's' : ''} earned · {stage.name} stage
      </Typography>
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/badges/GardenHeader.js
git commit -m "feat(badges): add GardenHeader SVG component with 4 evolution stages"
```

---

### Task 10: BadgeCollection Component

**Files:**
- Create: `src/components/badges/BadgeCollection.js`

- [ ] **Step 1: Create BadgeCollection component**

```js
import React from 'react';
import { Box, LinearProgress, Typography } from '@mui/material';
import BadgeIcon from './BadgeIcon';
import GardenHeader from './GardenHeader';

export default function BadgeCollection({ studentName, badges = [], nearMisses = [], stats }) {
  const earned = badges || [];
  const hasAny = earned.length > 0 || nearMisses.length > 0;

  return (
    <Box>
      <GardenHeader badgeCount={earned.length} studentName={studentName} />

      <Box sx={{ p: 2 }}>
        {/* Earned badges */}
        {earned.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1, color: '#3D3427' }}>
              Earned
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5, mb: 2 }}>
              {earned.map((b) => (
                <BadgeIcon
                  key={b.badgeId}
                  badge={{
                    ...b,
                    // Look up display info from definitions
                    name: b.name || b.badgeId,
                    icon: b.icon || 'bookworm',
                  }}
                  size="medium"
                />
              ))}
            </Box>
          </>
        )}

        {/* Near misses */}
        {nearMisses.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1, color: '#3D3427' }}>
              Almost there
            </Typography>
            {nearMisses.map((nm) => (
              <Box
                key={nm.badgeId}
                sx={{
                  background: '#FFF8EE',
                  borderRadius: 2,
                  p: 1.5,
                  mb: 1,
                  border: '1px solid #F0E4CC',
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: 18, opacity: 0.5 }}>
                      {nm.icon || '🏆'}
                    </Typography>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: '#3D3427' }}>
                        {nm.name} {nm.tier !== 'single' ? `(${nm.tier})` : ''}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#8B7E6A' }}>
                        {nm.remaining} more to go!
                      </Typography>
                    </Box>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#86A86B' }}>
                    {nm.current}/{nm.target}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, (nm.current / nm.target) * 100)}
                  sx={{
                    mt: 1,
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
            ))}
          </>
        )}

        {/* Empty state */}
        {!hasAny && (
          <Box sx={{ textAlign: 'center', py: 3, color: '#8B7E6A' }}>
            <Typography variant="body2">No badges earned yet. Every reading session helps the garden grow!</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/badges/BadgeCollection.js
git commit -m "feat(badges): add BadgeCollection with earned grid and near-miss progress"
```

---

### Task 11: BadgeCelebration Component

**Files:**
- Create: `src/components/badges/BadgeCelebration.js`

- [ ] **Step 1: Create BadgeCelebration modal**

```js
import React from 'react';
import { Dialog, DialogContent, Box, Typography, Button } from '@mui/material';
import BadgeIcon from './BadgeIcon';

export default function BadgeCelebration({ badges = [], onClose }) {
  if (!badges || badges.length === 0) return null;
  const badge = badges[0]; // Show first badge; if multiple, cycle or show summary

  return (
    <Dialog
      open={badges.length > 0}
      onClose={onClose}
      PaperProps={{
        sx: {
          borderRadius: 3,
          background: 'linear-gradient(135deg, #F5EFD6, #E8F5E2)',
          border: '1px solid #D4DEBC',
          maxWidth: 320,
        },
      }}
    >
      <DialogContent sx={{ textAlign: 'center', py: 3, px: 3 }}>
        <Typography sx={{ fontSize: 40, mb: 1 }}>🌸</Typography>
        <Typography variant="h6" sx={{ fontWeight: 600, color: '#3D3427', mb: 2 }}>
          {badges.length > 1 ? `${badges.length} new badges earned!` : 'New badge earned!'}
        </Typography>
        <BadgeIcon badge={badge} size="large" showLabel />
        <Typography
          variant="body2"
          sx={{ color: '#5D6B4A', mt: 2, maxWidth: 240, mx: 'auto', lineHeight: 1.5 }}
        >
          {badge.unlockMessage}
        </Typography>
        {badges.length > 1 && (
          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center', mt: 1.5 }}>
            {badges.slice(1).map((b) => (
              <BadgeIcon key={b.id} badge={b} size="small" showLabel={false} />
            ))}
          </Box>
        )}
        <Button
          onClick={onClose}
          variant="contained"
          sx={{
            mt: 2.5,
            background: '#86A86B',
            '&:hover': { background: '#6B8F50' },
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 500,
          }}
        >
          Lovely!
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/badges/BadgeCelebration.js
git commit -m "feat(badges): add BadgeCelebration dialog for unlock moments"
```

---

### Task 12: BadgeIndicators Component

**Files:**
- Create: `src/components/badges/BadgeIndicators.js`

- [ ] **Step 1: Create BadgeIndicators for StudentCard**

```js
import React from 'react';
import { Box, Chip, Tooltip } from '@mui/material';

export default function BadgeIndicators({ badges = [], maxVisible = 4 }) {
  if (!badges || badges.length === 0) return null;

  const visible = badges.slice(0, maxVisible);
  const remaining = badges.length - maxVisible;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {/* Garden count chip */}
      <Tooltip title={`${badges.length} badge${badges.length !== 1 ? 's' : ''} earned`}>
        <Chip
          label={`🌿 ${badges.length}`}
          size="small"
          sx={{
            height: 22,
            fontSize: 11,
            fontWeight: 600,
            background: 'linear-gradient(135deg, #86A86B, #6B8F50)',
            color: 'white',
            '& .MuiChip-label': { px: 1 },
          }}
        />
      </Tooltip>
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/badges/BadgeIndicators.js
git commit -m "feat(badges): add BadgeIndicators chip for StudentCard"
```

---

## Chunk 5: Frontend Integration

### Task 13: Integrate Badges into StudentCard

**Files:**
- Modify: `src/components/students/StudentCard.js:157-159` (next to StreakBadge)

- [ ] **Step 1: Add BadgeIndicators to StudentCard**

Import at top of StudentCard.js:
```js
import BadgeIndicators from '../badges/BadgeIndicators';
```

Add the badge indicator next to the existing StreakBadge render (~line 157-159). After the StreakBadge conditional:
```js
{student.currentStreak > 0 && (
  <StreakBadge streak={student.currentStreak} size="small" />
)}
```

Add:
```js
{student.badges && student.badges.length > 0 && (
  <BadgeIndicators badges={student.badges} />
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/students/StudentCard.js
git commit -m "feat(badges): show badge indicators on StudentCard"
```

---

### Task 14: Integrate Badges into StudentDetailDrawer

**Files:**
- Modify: `src/components/students/StudentDetailDrawer.js`

- [ ] **Step 1: Add BadgeCollection to student detail view**

Import at top:
```js
import BadgeCollection from '../badges/BadgeCollection';
import { BADGE_DEFINITIONS } from '../../utils/badgeDefinitions';
```

Create a lookup map at module level (before the component):
```js
const BADGE_MAP = Object.fromEntries(BADGE_DEFINITIONS.map((b) => [b.id, b]));
```

In the sidebar render (both mobile and desktop), add the BadgeCollection component after the StudentReadView. Add after the StudentReadView render (~line 427 for desktop, ~line 493 for mobile):

```js
{fullStudent && (
  <BadgeCollection
    studentName={fullStudent.name?.split(' ')[0]}
    badges={(fullStudent.badges || []).map((b) => {
      const def = BADGE_MAP[b.badgeId];
      return { ...b, name: def?.name || b.badgeId, icon: def?.icon || 'bookworm', description: def?.description };
    })}
    nearMisses={fullStudent.nearMisses || []}
    stats={fullStudent.readingStats}
  />
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/students/StudentDetailDrawer.js
git commit -m "feat(badges): show BadgeCollection in student detail drawer"
```

---

### Task 15: Handle Badge Celebrations in SessionForm

**Files:**
- Modify: `src/components/sessions/SessionForm.js:276-322`

- [ ] **Step 1: Add celebration state and component**

Import at top:
```js
import BadgeCelebration from '../badges/BadgeCelebration';
```

Add state for celebration badges:
```js
const [celebrationBadges, setCelebrationBadges] = useState([]);
```

In the session save success handler (~line 284), check for newBadges in the response:

After `addReadingSession` returns successfully, the DataContext function returns the saved session. We need to modify DataContext's `addReadingSession` to also return `newBadges` from the API response (see Task 17). Once that's done, check:

```js
if (result?.newBadges?.length > 0) {
  setCelebrationBadges(result.newBadges);
}
```

Add the celebration component in the render, after the existing snackbar:
```js
<BadgeCelebration badges={celebrationBadges} onClose={() => setCelebrationBadges([])} />
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sessions/SessionForm.js
git commit -m "feat(badges): show badge celebration after session save"
```

---

### Task 16: Handle Badge Celebrations in HomeReadingRegister

**Files:**
- Modify: `src/components/sessions/HomeReadingRegister.js`

- [ ] **Step 1: Add bulk badge collection and summary toast**

Import at top:
```js
import BadgeCelebration from '../badges/BadgeCelebration';
```

Add state:
```js
const [celebrationBadges, setCelebrationBadges] = useState([]);
```

In the session save handlers (~lines 506-580), collect newBadges from responses. Since the register creates sessions one at a time via `addReadingSession`, accumulate badges:

After each `addReadingSession` call that returns a result with `newBadges`, append to a local array:
```js
const allNewBadges = [];
// ... inside the save loop:
const result = await addReadingSession(student.id, { ... });
if (result?.newBadges?.length > 0) {
  allNewBadges.push(...result.newBadges);
}
// ... after the loop:
if (allNewBadges.length > 0) {
  setCelebrationBadges(allNewBadges);
}
```

Add the celebration component:
```js
<BadgeCelebration badges={celebrationBadges} onClose={() => setCelebrationBadges([])} />
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sessions/HomeReadingRegister.js
git commit -m "feat(badges): handle badge celebrations in home reading register"
```

---

### Task 17: Update DataContext to Pass Through newBadges

**Files:**
- Modify: `src/contexts/DataContext.js:592-654` (addReadingSession function)

- [ ] **Step 1: Modify addReadingSession to return newBadges**

In DataContext.js, find the `addReadingSession` function (~line 592). Currently it POSTs to the API and returns the session object. Modify it to also return `newBadges` from the response:

The current pattern likely does:
```js
const data = await response.json();
// ... update state
return data; // or return the session
```

Ensure the full response (including `newBadges`) is returned to the caller:

```js
const data = await response.json();
// ... existing state updates (lastReadDate, totalSessionCount, etc.)
// Return the full response so callers can access newBadges
return data;
```

The key change: make sure `data.newBadges` is not stripped out before returning. If the current code extracts specific fields, add `newBadges` to what's passed back.

Also, when the student list is fetched from `GET /api/students`, the response now includes `badges` per student (from Task 6). If students are fetched via the list endpoint (which returns summary data), badges may not be included there — that's fine, badges are fetched on the detail endpoint.

- [ ] **Step 2: Commit**

```bash
git add src/contexts/DataContext.js
git commit -m "feat(badges): pass through newBadges from session API response"
```

---

### Task 18: Update CLAUDE.md File Map

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add new files to the file map**

Add to the file map section under the appropriate headings:

Under `src/utils/`:
```
src/utils/badgeDefinitions.js - Badge definitions with evaluate/progress functions, key stage resolution
src/utils/badgeEngine.js - Stats calculation, real-time/batch evaluation, genre classification, near-miss calculation
```

Under `src/routes/`:
```
src/routes/badges.js - GET/POST badge collection and notify endpoints
```

Under `src/components/`:
```
src/components/badges/BadgeIcon.js - Single badge circle with tier gradient and category icon
src/components/badges/GardenHeader.js - SVG garden header evolving through 4 stages (seedling→sprout→bloom→garden)
src/components/badges/BadgeCollection.js - Grid of earned badges + near-miss progress bars
src/components/badges/BadgeCelebration.js - Unlock celebration dialog shown after session save
src/components/badges/BadgeIndicators.js - Mini badge count chip for StudentCard
```

- [ ] **Step 2: Update .claude/structure/ YAML files**

Update `routes.yaml`, `utils-services.yaml`, and `components.yaml` with the new files and their exports.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md .claude/structure/
git commit -m "docs: add badge system files to CLAUDE.md file map and structure YAML"
```

---

### Task 19: Integration Testing

**Files:**
- Create: `src/__tests__/integration/badges.test.js`

- [ ] **Step 1: Write integration tests**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recalculateStats, evaluateRealTime, calculateNearMisses } from '../../utils/badgeEngine.js';
import { BADGE_DEFINITIONS, resolveKeyStage } from '../../utils/badgeDefinitions.js';

describe('Badge system integration', () => {
  // Test that the full flow works: recalculate stats → evaluate → near-misses
  it('awards First Finish badge when a student has their first book session', async () => {
    const sessions = [
      { session_date: '2026-04-01', book_id: 'b1', duration_minutes: 15, pages_read: 20, notes: '' },
    ];
    const books = [{ id: 'b1', author: 'Roald Dahl', genre_ids: '["genre-fiction"]' }];
    const genres = [{ id: 'genre-fiction', name: 'Realistic Fiction' }];

    let upsertedStats = null;
    let insertedBadges = [];
    const mockDb = {
      prepare: vi.fn((sql) => ({
        bind: vi.fn((...args) => ({
          all: vi.fn(() => {
            if (sql.includes('reading_sessions')) return { results: sessions };
            if (sql.includes('books b')) return { results: books };
            if (sql.includes('genres')) return { results: genres };
            if (sql.includes('student_badges')) return { results: [] };
            return { results: [] };
          }),
          first: vi.fn(() => {
            if (sql.includes('student_reading_stats')) return upsertedStats;
            return null;
          }),
          run: vi.fn(() => {
            if (sql.includes('INSERT INTO student_reading_stats') || sql.includes('ON CONFLICT')) {
              upsertedStats = {
                total_books: 1,
                total_sessions: 1,
                total_minutes: 15,
                total_pages: 20,
                genres_read: '["genre-fiction"]',
                unique_authors_count: 1,
                fiction_count: 1,
                nonfiction_count: 0,
                poetry_count: 0,
                days_read_this_week: 1,
                days_read_this_term: 1,
                days_read_this_month: 1,
                weeks_with_4plus_days: 0,
                weeks_with_reading: 1,
              };
            }
            if (sql.includes('INSERT INTO student_badges')) {
              insertedBadges.push(args);
            }
          }),
        })),
      })),
    };

    await recalculateStats(mockDb, 'stu-1', 'org-1');
    const newBadges = await evaluateRealTime(mockDb, 'stu-1', 'org-1', 'Y3');
    expect(newBadges.find((b) => b.id === 'first_finish')).toBeDefined();
  });

  it('calculates near-misses correctly', () => {
    const stats = {
      totalBooks: 6,
      totalMinutes: 100,
      totalPages: 80,
      genresRead: ['genre-adventure', 'genre-fantasy'],
      fictionCount: 5,
      nonfictionCount: 1,
      poetryCount: 0,
      daysReadThisWeek: 2,
      daysReadThisTerm: 10,
      daysReadThisMonth: 6,
      weeksWith4PlusDays: 0,
      weeksWithReading: 3,
    };
    const earnedBadgeIds = new Set(['first_finish', 'fiction_and_fact']);
    const nearMisses = calculateNearMisses(stats, 'Y4', earnedBadgeIds);
    // Should include bookworm_bronze (6/8 = 75% for LowerKS2) and genre_explorer_bronze (2/3 = 67%)
    expect(nearMisses.length).toBeGreaterThan(0);
    expect(nearMisses.length).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run src/__tests__/unit/badgeDefinitions.test.js src/__tests__/unit/badgeEngine.test.js src/__tests__/unit/rowMappers.badge.test.js src/__tests__/integration/badges.test.js`
Expected: All tests PASS.

- [ ] **Step 3: Run full test suite to check for regressions**

Run: `npm test`
Expected: All existing tests still PASS.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/integration/badges.test.js
git commit -m "test(badges): add integration tests for badge evaluation flow"
```

---

### Task 20: Apply Remote Migration and Deploy

- [ ] **Step 1: Apply migration to remote D1**

Run: `npx wrangler d1 migrations apply reading-manager-db --remote`
Expected: Migration 0046 applied.

- [ ] **Step 2: Build and deploy**

Run: `npm run go`
Expected: Build succeeds and deploys to production.

- [ ] **Step 3: Verify badge endpoints work**

Test the badge endpoint against production (or dev) by logging a session and checking the response includes `newBadges`.
