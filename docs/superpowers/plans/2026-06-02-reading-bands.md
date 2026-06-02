# Reading Bands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a gamified reading **volume band** — a coloured rank (Lilac → Free Reader) that auto-climbs as a child logs reads in the current academic year, shown read-only on student/parent surfaces, celebrating each move up.

**Architecture:** Mirror the existing **streak** subsystem exactly. A pure engine (`readingBandEngine.js`, like `streakCalculator.js`) does the maths; a KV-cached org setting (`readsPerBand`, like `streakGracePeriodDays`) holds the threshold; per-student fields (`current_band`, `band_reads_count`, `band_year_start`) are recomputed on session write in `students/sessions.js` where `updateStudentStreak` already runs. The academic-year reset is lazy (recompute when the stored `band_year_start` is stale — no cron). Parent celebration is **state-based**: the parent portal compares the child's `current_band` to a `parent_last_seen_band` marker on the token each load, so the parent is told about a climb even if a teacher's log caused it.

**Tech Stack:** Cloudflare Workers + Hono, D1 (SQLite), React 19 + MUI v7, Vitest (happy-dom). Plain JS, no TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-02-reading-bands-design.md`

---

## File Structure

**New files**
- `src/utils/readingBandDefinitions.js` — the fixed 16-band ladder constant + lookup helpers + `DEFAULT_READS_PER_BAND`.
- `src/utils/readingBandEngine.js` — pure functions: `readContribution`, `countReads`, `computeBandIndex`, `academicYearStart`, `bandForCount`, `bandTransition`.
- `migrations/0059_reading_bands.sql` — student + token columns + one-time backfill.
- `src/components/students/ReadingBandChip.js` — `<ReadingBandChip>` (chip) + `<ReadingBandProgress>` (progress to next), shared across surfaces.
- `src/components/badges/BandCelebration.js` — celebration dialog, styled like `BadgeCelebration.js`.
- Tests: `src/__tests__/unit/readingBandDefinitions.test.js`, `readingBandEngine.test.js`, `readingBandUpdate.test.js`, `parentBand.test.js`.

**Modified files**
- `src/routes/students/_shared.js` — add `getOrgBandSettings`, `updateStudentBand`, `ensureCurrentBand`.
- `src/routes/students/sessions.js` — POST/PUT/DELETE call `updateStudentBand`; POST returns `bandUp`.
- `src/utils/rowMappers.js` — `rowToStudent` maps `currentBand` + `bandReadsCount`.
- `src/routes/parent.js` — select band columns + token marker; compute parent `bandUp`; advance marker.
- `src/routes/organization/settings.js` + `src/components/Settings.js` — expose `readsPerBand`.
- `src/components/students/StudentCard.js`, `StudentReadView.js`, `StudentTable.js` — show the chip.
- `src/components/sessions/SessionForm.js`, `HomeReadingRegister.js` — show `BandCelebration` on `bandUp`.
- `src/components/parent/ParentPortal.js` — show band + progress + `BandCelebration` on `bandUp`.

Decisions carried from the spec, with one deviation: **the spec said "reuse `BadgeCelebration`"; we instead add a sibling `BandCelebration` in the same visual style** — `BadgeCelebration` is hard-wired to badge data (`BadgeIcon`, `unlockMessage`), so a dedicated component is cleaner than overloading it. The `readsPerBand` setting lives as a key in the existing key-value `org_settings` table (not a new column), matching `streakGracePeriodDays`.

---

## Task 1: Reading band ladder definitions

**Files:**
- Create: `src/utils/readingBandDefinitions.js`
- Test: `src/__tests__/unit/readingBandDefinitions.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// src/__tests__/unit/readingBandDefinitions.test.js
import { describe, it, expect } from 'vitest';
import {
  READING_BAND_LADDER,
  READING_BAND_COUNT,
  DEFAULT_READS_PER_BAND,
  getBandByIndex,
} from '../../utils/readingBandDefinitions.js';

describe('readingBandDefinitions', () => {
  it('has 16 ordered bands from Lilac to Free Reader', () => {
    expect(READING_BAND_COUNT).toBe(16);
    expect(READING_BAND_LADDER[0].name).toBe('Lilac');
    expect(READING_BAND_LADDER[15].name).toBe('Free Reader');
    READING_BAND_LADDER.forEach((b, i) => expect(b.index).toBe(i));
  });

  it('every band has a hex colour and text colour', () => {
    for (const b of READING_BAND_LADDER) {
      expect(b.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(b.textColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('getBandByIndex clamps out-of-range indices', () => {
    expect(getBandByIndex(-5).name).toBe('Lilac');
    expect(getBandByIndex(99).name).toBe('Free Reader');
    expect(getBandByIndex(2).name).toBe('Red');
  });

  it('default reads-per-band is 20', () => {
    expect(DEFAULT_READS_PER_BAND).toBe(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/readingBandDefinitions.test.js`
Expected: FAIL — cannot resolve `../../utils/readingBandDefinitions.js`.

- [ ] **Step 3: Write the implementation**

```javascript
// src/utils/readingBandDefinitions.js
/**
 * Reading Band ladder — a gamified VOLUME rank (not a difficulty level).
 * A child climbs one band per `readsPerBand` reads logged in the academic year.
 * Fixed in v1; only the reads-per-band threshold is configurable per school.
 */

export const READING_BAND_LADDER = [
  { index: 0, name: 'Lilac', color: '#C8A2C8', textColor: '#3A352E' },
  { index: 1, name: 'Pink', color: '#FFC0CB', textColor: '#3A352E' },
  { index: 2, name: 'Red', color: '#D7263D', textColor: '#FFFFFF' },
  { index: 3, name: 'Yellow', color: '#F4D03F', textColor: '#3A352E' },
  { index: 4, name: 'Blue', color: '#2E86DE', textColor: '#FFFFFF' },
  { index: 5, name: 'Green', color: '#27AE60', textColor: '#FFFFFF' },
  { index: 6, name: 'Orange', color: '#E67E22', textColor: '#FFFFFF' },
  { index: 7, name: 'Turquoise', color: '#1ABC9C', textColor: '#FFFFFF' },
  { index: 8, name: 'Purple', color: '#8E44AD', textColor: '#FFFFFF' },
  { index: 9, name: 'Gold', color: '#D4AF37', textColor: '#FFFFFF' },
  { index: 10, name: 'White', color: '#FFFFFF', textColor: '#3A352E' },
  { index: 11, name: 'Lime', color: '#A4C639', textColor: '#3A352E' },
  { index: 12, name: 'Brown', color: '#8B5E3C', textColor: '#FFFFFF' },
  { index: 13, name: 'Grey', color: '#9AA0A6', textColor: '#FFFFFF' },
  { index: 14, name: 'Dark Blue', color: '#1F3A93', textColor: '#FFFFFF' },
  { index: 15, name: 'Free Reader', color: '#6B4FA0', textColor: '#FFFFFF' },
];

export const READING_BAND_COUNT = READING_BAND_LADDER.length;
export const DEFAULT_READS_PER_BAND = 20;

export const getBandByIndex = (i) => {
  const clamped = Math.max(0, Math.min(Number(i) || 0, READING_BAND_COUNT - 1));
  return READING_BAND_LADDER[clamped];
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/readingBandDefinitions.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/readingBandDefinitions.js src/__tests__/unit/readingBandDefinitions.test.js
git commit -m "feat(bands): add reading band ladder definitions"
```

---

## Task 2: Pure reading band engine

**Files:**
- Create: `src/utils/readingBandEngine.js`
- Test: `src/__tests__/unit/readingBandEngine.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// src/__tests__/unit/readingBandEngine.test.js
import { describe, it, expect } from 'vitest';
import {
  readContribution,
  countReads,
  computeBandIndex,
  academicYearStart,
  bandForCount,
  bandTransition,
} from '../../utils/readingBandEngine.js';

describe('readContribution', () => {
  it('plain session counts as 1', () => {
    expect(readContribution(null)).toBe(1);
    expect(readContribution('Read with mum')).toBe(1);
  });
  it('[COUNT:n] multiple counts as n', () => {
    expect(readContribution('[COUNT:3]')).toBe(3);
    expect(readContribution('note [COUNT:5] more')).toBe(5);
  });
  it('absent / no-record count as 0', () => {
    expect(readContribution('[ABSENT]')).toBe(0);
    expect(readContribution('[NO_RECORD]')).toBe(0);
  });
});

describe('countReads', () => {
  it('sums contributions across rows', () => {
    const rows = [{ notes: null }, { notes: '[COUNT:3]' }, { notes: '[ABSENT]' }, { notes: 'x' }];
    expect(countReads(rows)).toBe(5); // 1 + 3 + 0 + 1
  });
  it('handles empty input', () => {
    expect(countReads([])).toBe(0);
    expect(countReads(null)).toBe(0);
  });
});

describe('computeBandIndex', () => {
  it('maps reads to band index at 20/band', () => {
    expect(computeBandIndex(0, 20)).toBe(0);
    expect(computeBandIndex(19, 20)).toBe(0);
    expect(computeBandIndex(20, 20)).toBe(1);
    expect(computeBandIndex(47, 20)).toBe(2);
    expect(computeBandIndex(300, 20)).toBe(15);
  });
  it('caps at the top band', () => {
    expect(computeBandIndex(10000, 20)).toBe(15);
  });
  it('respects a custom threshold and falls back on bad input', () => {
    expect(computeBandIndex(15, 5)).toBe(3);
    expect(computeBandIndex(40, 0)).toBe(2); // 0 -> default 20
  });
});

describe('academicYearStart', () => {
  it('Sept onwards uses this year', () => {
    expect(academicYearStart('2026-09-01')).toBe('2026-09-01');
    expect(academicYearStart('2026-12-15')).toBe('2026-09-01');
  });
  it('before Sept uses last year', () => {
    expect(academicYearStart('2026-08-31')).toBe('2025-09-01');
    expect(academicYearStart('2026-01-10')).toBe('2025-09-01');
  });
});

describe('bandForCount', () => {
  it('returns display payload with progress to next', () => {
    const b = bandForCount(47, 20);
    expect(b.name).toBe('Red');
    expect(b.nextAt).toBe(60);
    expect(b.toNext).toBe(13);
    expect(b.atTop).toBe(false);
  });
  it('top band has null progress', () => {
    const b = bandForCount(320, 20);
    expect(b.name).toBe('Free Reader');
    expect(b.toNext).toBeNull();
    expect(b.atTop).toBe(true);
  });
});

describe('bandTransition', () => {
  it('describes a climb', () => {
    const t = bandTransition(2, 4);
    expect(t.from.name).toBe('Red');
    expect(t.to.name).toBe('Blue');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/readingBandEngine.test.js`
Expected: FAIL — cannot resolve `../../utils/readingBandEngine.js`.

- [ ] **Step 3: Write the implementation**

```javascript
// src/utils/readingBandEngine.js
/**
 * Pure reading-band maths. No I/O — mirrors streakCalculator.js so it can be
 * unit-tested in isolation and reused by the route layer.
 */
import {
  READING_BAND_COUNT,
  DEFAULT_READS_PER_BAND,
  getBandByIndex,
} from './readingBandDefinitions.js';

const COUNT_MARKER = /\[COUNT:(\d+)\]/;

/** Reads contributed by one session, from its `notes` marker. */
export function readContribution(notes) {
  if (!notes) return 1;
  if (notes.includes('[ABSENT]') || notes.includes('[NO_RECORD]')) return 0;
  const m = notes.match(COUNT_MARKER);
  if (m) return parseInt(m[1], 10) || 0;
  return 1;
}

/** Total qualifying reads across an array of rows with a `notes` field. */
export function countReads(rows) {
  if (!rows || rows.length === 0) return 0;
  return rows.reduce((sum, r) => sum + readContribution(r.notes), 0);
}

function effectivePer(readsPerBand) {
  const per = parseInt(readsPerBand, 10);
  return per > 0 ? per : DEFAULT_READS_PER_BAND;
}

/** Band index (0..15) for a read count. */
export function computeBandIndex(readsCount, readsPerBand = DEFAULT_READS_PER_BAND) {
  const per = effectivePer(readsPerBand);
  const idx = Math.floor((Number(readsCount) || 0) / per);
  return Math.max(0, Math.min(idx, READING_BAND_COUNT - 1));
}

/** ISO date (YYYY-MM-DD) of the academic-year start (1 Sep) on/before `today`. */
export function academicYearStart(today, startMonth = 9, startDay = 1) {
  const s = typeof today === 'string' ? today : null;
  let year;
  let month;
  let dom;
  if (s && /^\d{4}-\d{2}-\d{2}/.test(s)) {
    year = parseInt(s.slice(0, 4), 10);
    month = parseInt(s.slice(5, 7), 10);
    dom = parseInt(s.slice(8, 10), 10);
  } else {
    const d = today instanceof Date ? today : new Date();
    year = d.getUTCFullYear();
    month = d.getUTCMonth() + 1;
    dom = d.getUTCDate();
  }
  const afterStart = month > startMonth || (month === startMonth && dom >= startDay);
  const startYear = afterStart ? year : year - 1;
  return `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
}

/** Display payload for a band, including progress to the next band. */
export function bandForCount(readsCount, readsPerBand = DEFAULT_READS_PER_BAND) {
  const per = effectivePer(readsPerBand);
  const count = Number(readsCount) || 0;
  const index = computeBandIndex(count, per);
  const band = getBandByIndex(index);
  const atTop = index >= READING_BAND_COUNT - 1;
  const nextAt = atTop ? null : (index + 1) * per;
  const toNext = atTop ? null : nextAt - count;
  return { ...band, readsCount: count, readsPerBand: per, nextAt, toNext, atTop };
}

/** Transition object for a celebration (from band -> to band). */
export function bandTransition(fromIndex, toIndex) {
  return { from: getBandByIndex(fromIndex), to: getBandByIndex(toIndex) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/readingBandEngine.test.js`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/utils/readingBandEngine.js src/__tests__/unit/readingBandEngine.test.js
git commit -m "feat(bands): add pure reading band engine"
```

---

## Task 3: Database migration + backfill

**Files:**
- Create: `migrations/0059_reading_bands.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 0059: Reading bands (gamified reading-volume rank)
-- Per-student band derived from reads logged in the current academic year.

ALTER TABLE students ADD COLUMN band_reads_count INTEGER DEFAULT 0;
ALTER TABLE students ADD COLUMN current_band INTEGER DEFAULT 0;
ALTER TABLE students ADD COLUMN band_year_start TEXT;

-- Parent-view state: highest band a parent has already been shown a celebration
-- for. NULL means "never seen" -> the portal silently adopts the current band
-- on first open (no false celebration after deploy).
ALTER TABLE parent_access_tokens ADD COLUMN parent_last_seen_band INTEGER;

-- One-time approximate backfill for the current academic year. Each non-marker
-- session counts as 1 here; [COUNT:n] multiples and any org-specific
-- reads_per_band are corrected on the student's next session write. 20/band default.
UPDATE students
SET band_year_start = CASE
      WHEN CAST(strftime('%m', 'now') AS INTEGER) >= 9
        THEN strftime('%Y', 'now') || '-09-01'
      ELSE (CAST(strftime('%Y', 'now') AS INTEGER) - 1) || '-09-01'
    END;

UPDATE students
SET band_reads_count = (
  SELECT COUNT(*)
  FROM reading_sessions rs
  WHERE rs.student_id = students.id
    AND rs.session_date >= students.band_year_start
    AND (rs.notes IS NULL OR (rs.notes NOT LIKE '%[ABSENT]%' AND rs.notes NOT LIKE '%[NO_RECORD]%'))
);

UPDATE students SET current_band = MIN(15, band_reads_count / 20);

-- Existing parents adopt the child's current band so they aren't spammed with a
-- celebration for an already-held band on first open.
UPDATE parent_access_tokens
SET parent_last_seen_band = (
  SELECT s.current_band FROM students s WHERE s.id = parent_access_tokens.student_id
);
```

- [ ] **Step 2: Apply locally and verify columns exist**

Run:
```bash
npx wrangler d1 migrations apply reading-manager-db --local
npx wrangler d1 execute reading-manager-db --local \
  --command "SELECT id, band_reads_count, current_band, band_year_start FROM students LIMIT 3;"
```
Expected: command succeeds; rows show the new columns populated (band 0 on a fresh seed DB).

- [ ] **Step 3: Commit**

```bash
git add migrations/0059_reading_bands.sql
git commit -m "feat(bands): add reading band columns + backfill migration"
```

---

## Task 4: Backend band helpers (settings, update, lazy reset)

**Files:**
- Modify: `src/routes/students/_shared.js` (add three exports near `updateStudentStreak`)
- Test: `src/__tests__/unit/readingBandUpdate.test.js`

- [ ] **Step 1: Write the failing test (mock D1)**

```javascript
// src/__tests__/unit/readingBandUpdate.test.js
import { describe, it, expect, vi } from 'vitest';
import { updateStudentBand } from '../../routes/students/_shared.js';

// Minimal D1 mock: prepare().bind().{first,all,run}
function makeDb({ currentBand = 0, sessionNotes = [] }) {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes('SELECT current_band')) return { current_band: currentBand };
              return null;
            },
            async all() {
              if (sql.includes('FROM reading_sessions')) {
                return { results: sessionNotes.map((notes) => ({ notes })) };
              }
              return { results: [] };
            },
            async run() {
              calls.push({ sql, args });
              return { success: true };
            },
          };
        },
      };
    },
  };
  return { db, calls };
}

// No KV -> getOrgBandSettings falls back to the org_settings query, which our
// mock returns empty for, so readsPerBand defaults to 20.
const env = {};

describe('updateStudentBand', () => {
  it('computes band from in-year reads and returns bandUp on a climb', async () => {
    // 20 plain reads -> band 1; previous band 0 -> bandUp 0->1
    const { db, calls } = makeDb({ currentBand: 0, sessionNotes: Array(20).fill('read') });
    const result = await updateStudentBand(db, 'stu1', 'org1', env, { timezone: 'UTC' });
    expect(result.currentBand).toBe(1);
    expect(result.readsCount).toBe(20);
    expect(result.bandUp).not.toBeNull();
    expect(result.bandUp.to.name).toBe('Pink');
    // it persisted current_band
    expect(calls.some((c) => c.sql.includes('UPDATE students SET band_reads_count'))).toBe(true);
  });

  it('returns no bandUp when the band does not increase', async () => {
    const { db } = makeDb({ currentBand: 1, sessionNotes: Array(25).fill('read') });
    const result = await updateStudentBand(db, 'stu1', 'org1', env, { timezone: 'UTC' });
    expect(result.currentBand).toBe(1); // 25/20 -> 1
    expect(result.bandUp).toBeNull();
  });

  it('counts [COUNT:n] multiples and ignores absences', async () => {
    const { db } = makeDb({
      currentBand: 0,
      sessionNotes: ['read', '[COUNT:5]', '[ABSENT]', '[NO_RECORD]'],
    });
    const result = await updateStudentBand(db, 'stu1', 'org1', env, { timezone: 'UTC' });
    expect(result.readsCount).toBe(6); // 1 + 5 + 0 + 0
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/readingBandUpdate.test.js`
Expected: FAIL — `updateStudentBand` is not exported.

- [ ] **Step 3: Add the helpers to `_shared.js`**

Add this import at the top of `src/routes/students/_shared.js` (alongside the existing `calculateStreak` import):

```javascript
import { getDateString } from '../../utils/streakCalculator.js';
import {
  countReads,
  computeBandIndex,
  academicYearStart,
  bandTransition,
} from '../../utils/readingBandEngine.js';
import { DEFAULT_READS_PER_BAND } from '../../utils/readingBandDefinitions.js';
```

Append these exports at the end of `src/routes/students/_shared.js`:

```javascript
/**
 * Reads-per-band threshold for an org. KV-cached (1h), mirroring
 * getOrgStreakSettings — keeps the per-session-write band update off the D1
 * hot path. Stored as the `readsPerBand` key in the org_settings table.
 */
export const getOrgBandSettings = async (db, organizationId, env) => {
  const cacheKey = `org-band-settings:${organizationId}`;
  const KV = env?.READING_MANAGER_KV;

  if (KV) {
    try {
      const cached = await KV.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {
      /* fall through to D1 */
    }
  }

  const row = await db
    .prepare(
      `SELECT setting_value FROM org_settings WHERE organization_id = ? AND setting_key = 'readsPerBand'`
    )
    .bind(organizationId)
    .first();

  let readsPerBand = DEFAULT_READS_PER_BAND;
  if (row?.setting_value) {
    try {
      const parsed = parseInt(JSON.parse(row.setting_value), 10);
      if (parsed > 0) readsPerBand = parsed;
    } catch {
      /* use default */
    }
  }

  const settings = { readsPerBand };
  if (KV) {
    try {
      await KV.put(cacheKey, JSON.stringify(settings), { expirationTtl: 3600 });
    } catch {
      /* non-critical */
    }
  }
  return settings;
};

/**
 * Recompute and persist a student's reading band from this academic year's
 * reads. Called after any session create/update/delete. Returns a `bandUp`
 * transition object when the band INCREASED (for celebration), else null.
 */
export const updateStudentBand = async (db, studentId, organizationId, env, { timezone } = {}) => {
  const { readsPerBand } = await getOrgBandSettings(db, organizationId, env || {});
  const tz = timezone || 'UTC';
  const yearStart = academicYearStart(getDateString(new Date(), tz));

  const prevRow = await db
    .prepare('SELECT current_band FROM students WHERE id = ?')
    .bind(studentId)
    .first();
  const previousBand = prevRow?.current_band || 0;

  const rows = await db
    .prepare(`SELECT notes FROM reading_sessions WHERE student_id = ? AND session_date >= ?`)
    .bind(studentId, yearStart)
    .all();

  const readsCount = countReads(rows.results || []);
  const currentBand = computeBandIndex(readsCount, readsPerBand);

  await db
    .prepare(
      `UPDATE students SET band_reads_count = ?, current_band = ?, band_year_start = ?,
         updated_at = datetime("now") WHERE id = ?`
    )
    .bind(readsCount, currentBand, yearStart, studentId)
    .run();

  const bandUp = currentBand > previousBand ? bandTransition(previousBand, currentBand) : null;
  return { previousBand, currentBand, readsCount, bandUp };
};

/**
 * Ensure a student's stored band matches the CURRENT academic year. If the
 * stored band_year_start is stale (new year) or never computed, recompute.
 * Used by read paths (parent portal, student detail) so the yearly reset
 * happens lazily without a cron. Never celebrates (drops/first-compute are silent).
 */
export const ensureCurrentBand = async (db, studentRow, organizationId, env, { timezone } = {}) => {
  const tz = timezone || 'UTC';
  const yearStart = academicYearStart(getDateString(new Date(), tz));
  if (studentRow.band_year_start === yearStart) {
    return {
      currentBand: studentRow.current_band || 0,
      bandReadsCount: studentRow.band_reads_count || 0,
      recomputed: false,
    };
  }
  const r = await updateStudentBand(db, studentRow.id, organizationId, env, { timezone: tz });
  return { currentBand: r.currentBand, bandReadsCount: r.readsCount, recomputed: true };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/readingBandUpdate.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/routes/students/_shared.js src/__tests__/unit/readingBandUpdate.test.js
git commit -m "feat(bands): add org band settings + student band updater"
```

---

## Task 5: Wire band updates into the session routes

**Files:**
- Modify: `src/routes/students/sessions.js`

- [ ] **Step 1: Import the band updater**

In `src/routes/students/sessions.js`, change the `_shared.js` import to add the band functions:

```javascript
import {
  getOrgStreakSettings,
  updateStudentStreak,
  updateStudentBand,
} from './_shared.js';
```

- [ ] **Step 2: POST handler — run the band update in the side-effects block and capture `bandUp`**

In the POST `/:id/sessions` handler, the side-effects currently look like:

```javascript
    const [, , completedGoalsResult] = await Promise.all([
      runSafe('streak update', () => updateStudentStreak(db, id, organizationId, c.env)),
      runSafe('stats recalc', () => recalculateStats(db, id, organizationId)),
      isMarkerSession
        ? Promise.resolve(undefined)
        : runSafe('class goal update', () => updateClassGoalOnSession(db, id, organizationId)),
    ]);
    const completedGoals = completedGoalsResult || [];
```

Replace with (adds the band update as a fourth parallel side-effect and keeps its result):

```javascript
    const [, , completedGoalsResult, bandResult] = await Promise.all([
      runSafe('streak update', () => updateStudentStreak(db, id, organizationId, c.env)),
      runSafe('stats recalc', () => recalculateStats(db, id, organizationId)),
      isMarkerSession
        ? Promise.resolve(undefined)
        : runSafe('class goal update', () => updateClassGoalOnSession(db, id, organizationId)),
      runSafe('band update', () =>
        updateStudentBand(db, id, organizationId, c.env, { timezone })
      ),
    ]);
    const completedGoals = completedGoalsResult || [];
    const bandUp = bandResult?.bandUp || null;
```

Note: `timezone` is already in scope (destructured from `getOrgStreakSettings` near the top of the handler). The band update runs for marker sessions too — that's fine; `[ABSENT]`/`[NO_RECORD]` contribute 0 reads so the band won't change, and `bandUp` will be null.

Then add `bandUp` to the success response object (the `c.json({ ... }, 201)` near the end of the multi-tenant branch), alongside `newBadges`:

```javascript
        newBadges,
        completedGoals,
        bandUp,
```

- [ ] **Step 3: DELETE and PUT handlers — keep the band accurate (no celebration)**

In the DELETE `/:id/sessions/:sessionId` multi-tenant branch, after the existing `await updateStudentStreak(...)`:

```javascript
      await updateStudentStreak(db, id, organizationId, c.env);
      await updateStudentBand(db, id, organizationId, c.env);
      await recalculateStats(db, id, organizationId);
```

In the PUT `/:id/sessions/:sessionId` multi-tenant branch, after the existing `await updateStudentStreak(...)` (where `timezone` is already destructured at the top of the handler):

```javascript
      await updateStudentStreak(db, id, organizationId, c.env);
      await updateStudentBand(db, id, organizationId, c.env, { timezone });
      await recalculateStats(db, id, organizationId);
```

- [ ] **Step 4: Manual verification with the local worker**

Run the worker and seed (`npm run seed:local` once if not already), then create reads via the API or UI. Confirm via:
```bash
npx wrangler d1 execute reading-manager-db --local \
  --command "SELECT id, band_reads_count, current_band FROM students WHERE band_reads_count > 0 LIMIT 5;"
```
Expected: `current_band` increments after ~`readsPerBand` reads; deleting sessions lowers `band_reads_count`.

- [ ] **Step 5: Run the full unit suite (no regressions) and commit**

Run: `npx vitest run`
Expected: PASS (existing suites + the new band tests).

```bash
git add src/routes/students/sessions.js
git commit -m "feat(bands): recompute band on session write; return bandUp from POST"
```

---

## Task 6: Map band fields to the student API shape

**Files:**
- Modify: `src/utils/rowMappers.js` (inside `rowToStudent`)
- Test: `src/__tests__/unit/readingBandEngine.test.js` is unaffected; add a focused mapper test.

The teacher list (`students.js` uses `SELECT s.*`) and detail (`SELECT * FROM students`) already select the new columns, so they flow through once the mapper reads them.

- [ ] **Step 1: Write the failing test**

```javascript
// src/__tests__/unit/rowMappers.band.test.js
import { describe, it, expect } from 'vitest';
import { rowToStudent } from '../../utils/rowMappers.js';

describe('rowToStudent band fields', () => {
  it('maps current_band and band_reads_count', () => {
    const s = rowToStudent({ id: 's1', name: 'Aria', current_band: 2, band_reads_count: 47 });
    expect(s.currentBand).toBe(2);
    expect(s.bandReadsCount).toBe(47);
  });
  it('defaults to band 0 when absent', () => {
    const s = rowToStudent({ id: 's1', name: 'Aria' });
    expect(s.currentBand).toBe(0);
    expect(s.bandReadsCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/rowMappers.band.test.js`
Expected: FAIL — `currentBand` is `undefined`.

- [ ] **Step 3: Add the mappings**

In `src/utils/rowMappers.js`, inside the `rowToStudent` return object (after the `streakStartDate` line), add:

```javascript
    currentBand: row.current_band || 0,
    bandReadsCount: row.band_reads_count || 0,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/rowMappers.band.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/rowMappers.js src/__tests__/unit/rowMappers.band.test.js
git commit -m "feat(bands): expose currentBand/bandReadsCount on student API"
```

---

## Task 7: Parent portal — band + deferred celebration

**Files:**
- Modify: `src/routes/parent.js`
- Test: `src/__tests__/unit/parentBand.test.js`

The parent student-view GET handler currently selects `SELECT id, name, current_book_id, current_streak, last_read_date` (around line 103) and loads the token (around line 51). We add the band columns + the token marker, then compute a parent-facing `bandUp` using the rule: NULL marker → adopt silently; `current_band > marker` → celebrate and advance.

- [ ] **Step 1: Write the failing test for the decision helper**

We extract the parent-celebration decision into a small pure helper so it is testable without a live DB.

```javascript
// src/__tests__/unit/parentBand.test.js
import { describe, it, expect } from 'vitest';
import { decideParentBandCelebration } from '../../routes/parent.js';

describe('decideParentBandCelebration', () => {
  it('adopts silently on first view (marker null)', () => {
    const r = decideParentBandCelebration(null, 3);
    expect(r.bandUp).toBeNull();
    expect(r.newSeen).toBe(3);
  });
  it('celebrates a climb and advances the marker', () => {
    const r = decideParentBandCelebration(2, 4);
    expect(r.bandUp).not.toBeNull();
    expect(r.bandUp.from.name).toBe('Red');
    expect(r.bandUp.to.name).toBe('Blue');
    expect(r.newSeen).toBe(4);
  });
  it('no celebration when band unchanged or lower', () => {
    expect(decideParentBandCelebration(4, 4).bandUp).toBeNull();
    expect(decideParentBandCelebration(4, 2).bandUp).toBeNull();
    expect(decideParentBandCelebration(4, 2).newSeen).toBe(4); // marker never decreases
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/parentBand.test.js`
Expected: FAIL — `decideParentBandCelebration` is not exported.

- [ ] **Step 3: Add the helper + imports to `parent.js`**

At the top of `src/routes/parent.js`, add:

```javascript
import { bandForCount, bandTransition } from '../utils/readingBandEngine.js';
import { ensureCurrentBand, getOrgBandSettings } from './students/_shared.js';
```

Add the exported pure helper near the top of the module (after imports):

```javascript
/**
 * Decide whether to show a parent the band-up celebration on portal load.
 * marker = parent_last_seen_band (NULL until first view); current = child's band.
 * Returns { bandUp, newSeen } — newSeen is the value to persist (never decreases).
 */
export function decideParentBandCelebration(marker, currentBand) {
  const current = currentBand || 0;
  if (marker === null || marker === undefined) {
    return { bandUp: null, newSeen: current }; // first view: adopt silently
  }
  if (current > marker) {
    return { bandUp: bandTransition(marker, current), newSeen: current };
  }
  return { bandUp: null, newSeen: marker };
}
```

- [ ] **Step 4: Use it in the parent student-view handler**

Add `parent_last_seen_band` to the token SELECT (around line 51, the `SELECT pat.id as token_id, ...`) — append `, pat.parent_last_seen_band`.

Change the student SELECT (around line 103) from:

```javascript
      `SELECT id, name, current_book_id, current_streak, last_read_date`
```
to:
```javascript
      `SELECT id, name, current_book_id, current_streak, last_read_date,
              current_band, band_reads_count, band_year_start`
```

After the student row is loaded and before building the JSON response, add (use the org id available on the token row — `organization_id` is already used elsewhere in this handler; reuse that variable):

```javascript
    // Reading band: lazily reset for the academic year, then decide whether to
    // celebrate a climb the parent hasn't seen yet (e.g. a teacher's logs).
    const { readsPerBand } = await getOrgBandSettings(db, organizationId, c.env || {});
    const { currentBand } = await ensureCurrentBand(db, student, organizationId, c.env || {});
    const { bandUp, newSeen } = decideParentBandCelebration(
      token.parent_last_seen_band,
      currentBand
    );
    if (newSeen !== token.parent_last_seen_band) {
      await db
        .prepare('UPDATE parent_access_tokens SET parent_last_seen_band = ? WHERE id = ?')
        .bind(newSeen, token.token_id)
        .run();
    }
    const band = bandForCount(
      currentBand * readsPerBand <= student.band_reads_count ? student.band_reads_count : currentBand * readsPerBand,
      readsPerBand
    );
```

> Implementation note: `band_reads_count` after `ensureCurrentBand` is the source for progress display. If the variable names for the token row / org id differ in the surrounding code, match them — the loaded token object is the one carrying `token_id` and `parent_last_seen_band`; the org id is the same one used by the book-availability check later in the handler. Simplify the `band` line to `bandForCount(student.band_reads_count, readsPerBand)` if `ensureCurrentBand` did not recompute (it leaves `student.band_reads_count` stale only on a year boundary — re-read the count if you prefer exactness).

Add `band` and `bandUp` to the JSON response object this handler returns (alongside the existing `current` streak field):

```javascript
      band,        // { name, color, textColor, readsCount, toNext, nextAt, atTop }
      bandUp,      // null, or { from, to } for the celebration
```

- [ ] **Step 5: Run test + full suite**

Run: `npx vitest run src/__tests__/unit/parentBand.test.js && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/parent.js src/__tests__/unit/parentBand.test.js
git commit -m "feat(bands): parent portal band display + deferred celebration"
```

---

## Task 8: School setting — reads per band

**Files:**
- Modify: `src/routes/organization/settings.js` (allow the `readsPerBand` key)
- Modify: `src/components/Settings.js` (number input)

- [ ] **Step 1: Inspect the existing streak setting plumbing**

Run:
```bash
grep -n "streakGracePeriodDays\|setting_key\|org_settings\|readsPerBand" src/routes/organization/settings.js
grep -n "streakGracePeriodDays\|gracePeriod\|Settings" src/components/Settings.js
```
Expected: find how `streakGracePeriodDays` is read in the GET and written in the PUT (the key-value upsert into `org_settings`), and how the Settings UI renders the grace-period field.

- [ ] **Step 2: Backend — accept and return `readsPerBand`**

Follow the exact pattern used for `streakGracePeriodDays`. If settings are written via a per-key allowlist, add `'readsPerBand'` to it. The canonical upsert (matching the `org_settings` UNIQUE(organization_id, setting_key) schema) is:

```javascript
await db
  .prepare(
    `INSERT INTO org_settings (id, organization_id, setting_key, setting_value, updated_by, updated_at)
     VALUES (?, ?, 'readsPerBand', ?, ?, datetime('now'))
     ON CONFLICT(organization_id, setting_key)
     DO UPDATE SET setting_value = excluded.setting_value, updated_by = excluded.updated_by, updated_at = datetime('now')`
  )
  .bind(generateId(), organizationId, JSON.stringify(readsPerBand), userId)
  .run();
```

In the GET, return `readsPerBand` (default 20) the same way the grace period is returned. **After writing, invalidate the KV cache** so `getOrgBandSettings` re-reads:

```javascript
try { await c.env.READING_MANAGER_KV?.delete(`org-band-settings:${organizationId}`); } catch { /* non-critical */ }
```

- [ ] **Step 3: Frontend — number field in Settings**

In `src/components/Settings.js`, alongside the streak/grace-period control, add a "Reads per band" number input (MUI `TextField type="number"`, min 1) bound to the settings state, defaulting to 20, persisted via the same save handler the page already uses. Match the surrounding field markup. Example field:

```jsx
<TextField
  label="Reads per band"
  type="number"
  inputProps={{ min: 1, step: 1 }}
  value={settings.readsPerBand ?? 20}
  onChange={(e) =>
    setSettings((s) => ({ ...s, readsPerBand: Math.max(1, parseInt(e.target.value, 10) || 20) }))
  }
  helperText="How many reads a child logs to climb one reading band (default 20)."
  size="small"
/>
```

- [ ] **Step 4: Verify**

Run: `npm run build` (ensures the component compiles) and manually change the setting, then confirm a child climbs a band at the new threshold on the next read.
Expected: build succeeds; threshold change takes effect after the KV cache is invalidated.

- [ ] **Step 5: Commit**

```bash
git add src/routes/organization/settings.js src/components/Settings.js
git commit -m "feat(bands): configurable reads-per-band school setting"
```

---

## Task 9: ReadingBandChip + progress component

**Files:**
- Create: `src/components/students/ReadingBandChip.js`

- [ ] **Step 1: Write the component**

```jsx
// src/components/students/ReadingBandChip.js
import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { getBandByIndex } from '../../utils/readingBandDefinitions';
import { bandForCount } from '../../utils/readingBandEngine';

/** Small coloured band chip for cards/tables. */
export function ReadingBandChip({ bandIndex = 0, size = 'small' }) {
  const band = getBandByIndex(bandIndex);
  const pad = size === 'small' ? '2px 8px' : '4px 12px';
  const font = size === 'small' ? 11 : 13;
  return (
    <Tooltip title={`Reading band: ${band.name}`}>
      <Box
        component="span"
        sx={{
          display: 'inline-block',
          bgcolor: band.color,
          color: band.textColor,
          border: '1px solid rgba(0,0,0,0.12)',
          borderRadius: 999,
          px: 0,
          py: 0,
          padding: pad,
          fontSize: font,
          fontWeight: 700,
          lineHeight: 1.4,
          whiteSpace: 'nowrap',
        }}
      >
        {band.name}
      </Box>
    </Tooltip>
  );
}

/** Band + progress-to-next bar for profile/parent surfaces. */
export function ReadingBandProgress({ readsCount = 0, readsPerBand = 20 }) {
  const band = bandForCount(readsCount, readsPerBand);
  const within = band.atTop ? readsPerBand : readsPerBand - band.toNext;
  const pct = band.atTop ? 100 : Math.round((within / readsPerBand) * 100);
  return (
    <Box>
      <ReadingBandChip bandIndex={band.index} size="medium" />
      <Box sx={{ height: 8, bgcolor: 'grey.200', borderRadius: 1, overflow: 'hidden', mt: 0.75 }}>
        <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: band.color, borderRadius: 1 }} />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
        {band.atTop
          ? `${readsCount} reads this year — top band reached! 🎉`
          : `${readsCount} reads this year · ${band.toNext} to ${getBandByIndex(band.index + 1).name}`}
      </Typography>
    </Box>
  );
}

export default ReadingBandChip;
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds (component is imported in later tasks; this step just checks syntax via a clean build, or temporarily import it in `App.js` and remove — simplest is to proceed and let Task 10's build catch issues).

- [ ] **Step 3: Commit**

```bash
git add src/components/students/ReadingBandChip.js
git commit -m "feat(bands): add ReadingBandChip + progress components"
```

---

## Task 10: Surface the band on teacher student views

**Files:**
- Modify: `src/components/students/StudentCard.js`
- Modify: `src/components/students/StudentReadView.js`
- Modify: `src/components/students/StudentTable.js`

The student API now returns `currentBand` and `bandReadsCount` on each student (Task 6). Render them, matching each file's existing layout idiom.

- [ ] **Step 1: StudentCard — add the chip near the streak badge**

Import at the top:
```jsx
import { ReadingBandChip } from './ReadingBandChip';
```
Where the card shows the streak (`StreakBadge`), render the band chip beside it:
```jsx
<ReadingBandChip bandIndex={student.currentBand || 0} size="small" />
```

- [ ] **Step 2: StudentReadView — add band + progress in the reading section**

Import:
```jsx
import { ReadingBandProgress } from './ReadingBandChip';
```
In the reading/level section, add (we need `readsPerBand` — read it from the data/settings context if available, else default 20):
```jsx
<ReadingBandProgress readsCount={student.bandReadsCount || 0} readsPerBand={readsPerBand || 20} />
```
> `readsPerBand` is the org setting. If `StudentReadView` doesn't already receive settings, pass it down from the parent (the settings are loaded in `DataContext`); a safe default of 20 keeps the bar correct for the default config. Wiring the exact org value is a small follow-up if settings aren't in scope here.

- [ ] **Step 3: StudentTable — add a Band column**

Add a `Band` column header and a cell rendering `<ReadingBandChip bandIndex={row.currentBand || 0} />`. If the table supports column sorting, add `currentBand` as a sortable key following the existing sort pattern (optional in v1).

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: build succeeds. Manually load the student list/detail and confirm chips render with the right colours.

- [ ] **Step 5: Commit**

```bash
git add src/components/students/StudentCard.js src/components/students/StudentReadView.js src/components/students/StudentTable.js
git commit -m "feat(bands): show reading band on student card, detail, and table"
```

---

## Task 11: Band-up celebration (teacher + parent)

**Files:**
- Create: `src/components/badges/BandCelebration.js`
- Modify: `src/components/sessions/SessionForm.js`
- Modify: `src/components/sessions/HomeReadingRegister.js`
- Modify: `src/components/parent/ParentPortal.js`

- [ ] **Step 1: Create the celebration dialog (styled like BadgeCelebration)**

```jsx
// src/components/badges/BandCelebration.js
import React from 'react';
import { Dialog, DialogContent, Box, Typography, Button } from '@mui/material';

/**
 * Shown when a child climbs a reading band.
 * `bandUp` = { from: {name,color,textColor}, to: {name,color,textColor} }.
 */
export default function BandCelebration({ bandUp, studentName, onClose }) {
  if (!bandUp) return null;
  const { from, to } = bandUp;
  return (
    <Dialog
      open={!!bandUp}
      onClose={onClose}
      aria-labelledby="band-celebration-title"
      PaperProps={{
        sx: {
          borderRadius: 3,
          background: 'linear-gradient(135deg, #F5EFD6, #E8F5E2)',
          border: '1px solid #D4DEBC',
          maxWidth: 340,
        },
      }}
    >
      <DialogContent sx={{ textAlign: 'center', py: 3, px: 3 }}>
        <Typography sx={{ fontSize: 40, mb: 1 }}>🎉</Typography>
        <Typography id="band-celebration-title" variant="h6" sx={{ fontWeight: 600, color: '#3D3427', mb: 2 }}>
          {studentName ? `${studentName} moved up a band!` : 'New reading band!'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', alignItems: 'center', mb: 1 }}>
          <BandPill band={from} />
          <Typography sx={{ fontSize: 22, color: '#86A86B' }}>→</Typography>
          <BandPill band={to} big />
        </Box>
        <Typography variant="body2" sx={{ color: '#5D6B4A', mt: 2, maxWidth: 250, mx: 'auto', lineHeight: 1.5 }}>
          Now on the <strong>{to.name}</strong> band — keep it up!
        </Typography>
        <Button
          onClick={onClose}
          variant="contained"
          sx={{ mt: 2.5, background: '#86A86B', '&:hover': { background: '#6B8F50' }, borderRadius: 2, textTransform: 'none', fontWeight: 500 }}
        >
          Lovely!
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function BandPill({ band, big = false }) {
  return (
    <Box
      component="span"
      sx={{
        bgcolor: band.color,
        color: band.textColor,
        border: '1px solid rgba(0,0,0,0.15)',
        borderRadius: 999,
        px: big ? 2 : 1.5,
        py: big ? 0.75 : 0.5,
        fontWeight: 700,
        fontSize: big ? 16 : 13,
      }}
    >
      {band.name}
    </Box>
  );
}
```

- [ ] **Step 2: SessionForm — show on save**

In `src/components/sessions/SessionForm.js`, near the existing `BadgeCelebration` usage:

Import + state:
```jsx
import BandCelebration from '../badges/BandCelebration';
// ...
const [bandUp, setBandUp] = useState(null);
```
After the save result is handled (where `result.newBadges` is processed around line 334):
```jsx
        if (result?.bandUp) setBandUp(result.bandUp);
```
Render near `<BadgeCelebration .../>`:
```jsx
<BandCelebration bandUp={bandUp} studentName={student?.name} onClose={() => setBandUp(null)} />
```

- [ ] **Step 3: HomeReadingRegister — collect band-ups from bulk saves**

In `src/components/sessions/HomeReadingRegister.js`, mirror the `collectedBadges` pattern. Add state `const [bandCelebrations, setBandCelebrations] = useState([]);`. Where each response `r`/`r1`/`r2` is inspected for `newBadges`, also collect band-ups with the student name:
```jsx
if (r?.bandUp) collectedBands.push({ bandUp: r.bandUp, studentName: /* the student for this row */ });
```
After processing, `setBandCelebrations(collectedBands)`. Render the first one and advance on close (one at a time, so a bulk register save doesn't stack dialogs):
```jsx
{bandCelebrations.length > 0 && (
  <BandCelebration
    bandUp={bandCelebrations[0].bandUp}
    studentName={bandCelebrations[0].studentName}
    onClose={() => setBandCelebrations((q) => q.slice(1))}
  />
)}
```
Import `BandCelebration` at the top alongside `BadgeCelebration`.
> Note: the register already names the student per row when building requests — reuse that name when pushing to `collectedBands`. If multiple children move up in one save, they queue and show in sequence.

- [ ] **Step 4: ParentPortal — show the deferred celebration + band display**

In `src/components/parent/ParentPortal.js`:
- Import `BandCelebration` and the `ReadingBandProgress` component.
- The portal data load now returns `band` and `bandUp` (Task 7). Render `band` prominently (e.g. `<ReadingBandProgress readsCount={data.band.readsCount} readsPerBand={data.band.readsPerBand} />` or a direct chip using `data.band`).
- On load, if `data.bandUp` is present, open `<BandCelebration bandUp={data.bandUp} studentName={data.studentName} onClose={...} />`. Because the server already advanced `parent_last_seen_band` when it returned `bandUp`, a refresh won't re-celebrate.

- [ ] **Step 5: Verify end-to-end**

Run: `npm run build`
Expected: build succeeds.

Manual: log reads as a teacher until a child crosses a threshold → `BandCelebration` shows in the register/session form. Open that child's parent portal → celebration shows once, then not again on refresh.

- [ ] **Step 6: Commit**

```bash
git add src/components/badges/BandCelebration.js src/components/sessions/SessionForm.js src/components/sessions/HomeReadingRegister.js src/components/parent/ParentPortal.js
git commit -m "feat(bands): band-up celebration for teachers and parents"
```

---

## Task 12: Full verification

- [ ] **Step 1: Lint, format, tests, build (the CI gates)**

Run:
```bash
npx prettier --check "src/**/*.js"
npm run lint
npx vitest run
npm run build
```
Expected: prettier clean (run `npx prettier --write` on touched files if not), lint zero errors, all tests pass, build succeeds. These are exactly the gates `.github/workflows/build.yml` enforces.

- [ ] **Step 2: Migration sanity on a fresh DB**

Run:
```bash
npx wrangler d1 migrations apply reading-manager-db --local
npx wrangler d1 execute reading-manager-db --local \
  --command "SELECT COUNT(*) FROM students WHERE current_band IS NOT NULL;"
```
Expected: all student rows have a non-null `current_band`.

- [ ] **Step 3: Final commit (if any formatting fixups)**

```bash
git add -A
git commit -m "chore(bands): formatting + final verification"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Volume band auto from in-year reads → Tasks 2, 4, 5. ✓
- 20/band configurable → Task 8 (`readsPerBand`), default in Task 1. ✓
- Per-academic-year window + lazy reset → `academicYearStart` (T2) + `ensureCurrentBand` (T4) + backfill (T3). ✓
- "What counts as a read" (read=1, `[COUNT:n]`=n, absent/no-record=0, home+school) → `readContribution`/`countReads` (T2), session query has no `location` filter so home+school both count (T4). ✓
- Fixed 16-colour ladder + Free Reader cap → T1 + `computeBandIndex` clamp (T2). ✓
- Storage: `students.{band_reads_count,current_band,band_year_start}`, `parent_access_tokens.parent_last_seen_band`, `org_settings.readsPerBand` → T3, T8. ✓
- Display-only on profile/card/table/parent → T9, T10, T7+T11. ✓
- Celebration: immediate for staff (POST `bandUp`, T5 + T11), state-based for parent (T7 + T11). ✓
- Backfill sets parent marker = current band (no false celebration) → T3; new tokens adopt silently via NULL marker → T7. ✓

**Placeholder scan:** No "TBD"/"handle edge cases". Two notes explicitly flag where the engineer must match surrounding variable names (parent.js org-id/token variables; `readsPerBand` prop wiring in StudentReadView) — these are integration checks, not missing logic, and a safe default (20) is specified.

**Type/name consistency:** `updateStudentBand`/`ensureCurrentBand`/`getOrgBandSettings` defined in T4 and used with the same signatures in T5/T7. `bandUp` shape `{from,to}` (from `bandTransition`) is produced in T4/T7 and consumed in T11. `currentBand`/`bandReadsCount` mapped in T6 and consumed in T10. `ReadingBandChip`/`ReadingBandProgress` defined in T9, imported in T10/T11. Consistent.
