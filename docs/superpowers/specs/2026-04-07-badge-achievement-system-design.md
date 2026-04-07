# Badge & Achievement System — Design Spec

**Date**: 2026-04-07
**Status**: Approved
**Research**: See `~/vault/topics/tally-reading-badges.md` for competitive landscape, evidence base, and NC alignment.

## Summary

A student badge and achievement system for Tally Reading, targeting UK primary children (Reception–Y6). Badges function as informational feedback grounded in Self-Determination Theory — celebrating effort, strategy, and curiosity rather than innate ability. A "reading garden" visual metaphor evolves as students earn badges, giving emotional resonance without the complexity trap of a full virtual world.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| MVP scope | Full engine + ~18 starter badges + garden theme | Garden theme is the differentiator; easier to add badges than retrofit a visual metaphor |
| Evaluation model | Hybrid: real-time on session log + nightly batch | Instant unlock moments for engagement; batch for slower badges (seasonal, exploration) |
| Badge definitions | Code-defined in JS | Version-controlled, testable, pedagogically grounded thresholds shouldn't be tweakable per-school |
| Primary surface | Teacher-focused with near-miss indicators | Teachers create celebration moments; near-miss is the actionable feature |
| Garden implementation | Progressive header illustration (not interactive landscape) | Avoids Reading Eggs trap; lightweight but emotionally resonant |
| Age thresholds | Year group → key stage, fallback to Lower KS2 | Year group data exists from Wonde; LKS2 is safe middle-ground default |
| Architecture | Denormalized student stats + stateless badge evaluation | Stats useful beyond badges; evaluation is cheap threshold checks |

## Data Model

### New table: `student_reading_stats`

Per-student aggregated counters, updated on every session write. Organization-scoped.

| Column | Type | Purpose |
|--------|------|---------|
| `student_id` | TEXT PK, FK → students | One row per student |
| `organization_id` | TEXT FK → organizations | Tenant scoping |
| `total_books` | INTEGER | Distinct books with at least one reading session |
| `total_sessions` | INTEGER | Total reading sessions logged |
| `total_minutes` | INTEGER | Sum of `duration_minutes` |
| `total_pages` | INTEGER | Sum of `pages_read` |
| `genres_read` | TEXT (JSON) | Array of distinct genre IDs encountered (bounded by genre count, ~15 max) |
| `unique_authors_count` | INTEGER | Count of distinct authors read |
| `fiction_count` | INTEGER | Books where genre maps to fiction type (see genre classification below) |
| `nonfiction_count` | INTEGER | Books where genre maps to nonfiction type |
| `poetry_count` | INTEGER | Books where genre maps to poetry type |
| `days_read_this_week` | INTEGER | Distinct session dates in current Mon–Sun week |
| `days_read_this_term` | INTEGER | Distinct session dates in current term |
| `days_read_this_month` | INTEGER | Distinct session dates in current calendar month |
| `weeks_with_4plus_days` | INTEGER | Count of weeks in current month where student read 4+ days |
| `weeks_with_reading` | INTEGER | Weeks (Mon–Sun) with at least one session, current term |
| `updated_at` | TEXT | Last recalculation timestamp |

**Indexes**: `idx_reading_stats_org` on `organization_id` (nightly batch iterates per-org).

**Update path**: Updated in the same DB transaction as session create/update/delete. A `recalculateStats(studentId)` function does a full rebuild from sessions — used by nightly cron and on-demand if drift is suspected. The nightly cron processes students in chunks of 100 per `db.batch()` call (D1 batch limit).

**Monthly/term counter resets**: The nightly cron calls `recalculateStats()` which always rebuilds from source sessions — it does not zero-out and increment. If a student already logged a session on the 1st of the month before the 2:30 AM cron runs, the recalculation will correctly count it.

### Genre classification

Genres are classified into fiction/nonfiction/poetry via a hardcoded mapping in `badgeEngine.js`. The mapping uses genre names from the `genres` table:

Based on the default genres in `migrations/0007_genres.sql`:

- **Fiction**: Adventure, Fantasy, Mystery, Science Fiction, Realistic Fiction, Historical Fiction, Humor, Animal Stories, Fairy Tales, Graphic Novels, Horror/Scary, Sports
- **Nonfiction**: Non-Fiction, Biography
- **Poetry**: Poetry

Unrecognised genre names (from school-created custom genres) default to fiction. This is acceptable for MVP; a future wave could add a `genre_type` column to the `genres` table.

### New table: `student_badges`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | TEXT PK | Badge award ID |
| `student_id` | TEXT FK → students | Who earned it |
| `organization_id` | TEXT FK → organizations | Tenant scoping |
| `badge_id` | TEXT | References code-defined badge definition ID |
| `tier` | TEXT | `bronze`, `silver`, `gold`, `star` |
| `earned_at` | TEXT | ISO timestamp when awarded |
| `notified` | INTEGER | 0/1 — whether teacher has seen the unlock |

**Indexes**: `idx_badges_student` on `(student_id)`, `idx_badges_org` on `(organization_id)`.

**No changes to existing tables.** Reads from `students` (year_group, streaks), `reading_sessions`, `books` (genre), and `term_dates`.

## Badge Engine

### Badge definition structure

Each badge is a JS object in `src/utils/badgeDefinitions.js`:

```js
{
  id: 'bookworm_bronze',
  name: 'Bookworm',
  tier: 'bronze',
  category: 'volume',
  description: 'Read your first 5 books',
  unlockMessage: "You've finished 5 books! Your reading garden is growing.",
  icon: 'bookworm',
  keyStageThresholds: { KS1: 5, LowerKS2: 8, UpperKS2: 10 },
  evaluate: (stats, context) => stats.totalBooks >= threshold,
  progress: (stats, context) => ({ current: stats.totalBooks, target: threshold })
}
```

The `evaluate` and `progress` functions receive:
- `stats` — the `student_reading_stats` row (camelCase)
- `context` — `{ keyStage, streak, termDates, currentDate, earnedBadgeIds, sessions }` (`sessions` is only populated for batch-evaluated badges that need session-level queries, e.g. Weekend Reader)

**Near-miss threshold**: A badge is a "near miss" when progress is ≥60% of target and the badge is not yet earned. The `nearMisses` array in the API response is capped at 3 badges, sorted by closest to completion.

### Key stage resolution

`year_group` → key stage mapping:
- Reception, Y1, Y2 → `KS1`
- Y3, Y4 → `LowerKS2`
- Y5, Y6 → `UpperKS2`
- `null` / unrecognised → `LowerKS2` (safe middle-ground fallback)

### Real-time evaluation (on session create/update/delete)

1. Update `student_reading_stats` within the same DB transaction
2. Load student's existing `student_badges` rows
3. Filter badge definitions to real-time categories: volume, milestone, basic consistency (Steady Reader, Week Warrior use `days_read_this_week` from stats)
4. Run `evaluate()` for each unevaluated badge
5. Insert newly earned badges into `student_badges`
6. Return newly earned badge IDs in the session API response

### Nightly batch evaluation (cron at 2:30 AM UTC)

1. For each active student with sessions, rebuild `student_reading_stats` via `recalculateStats()` (corrects any drift, recalculates monthly/term counters from source sessions)
2. Load recent sessions for batch badges that need session-level data (e.g. Weekend Reader checks for Sat+Sun pairs)
3. Evaluate batch-category badges: exploration (needs book genre joins), Monthly Marvel (per-week breakdown), Series Finisher (per-author book counts), secret (Weekend Reader). Seasonal badges added in Wave 2
4. Insert any newly earned badges
5. Process students in chunks of 100 per `db.batch()` call (D1 batch limit)

## MVP Badge Set (~18 badges)

| Category | Badge | Tiers | KS1 Thresholds | LKS2 Thresholds | UKS2 Thresholds |
|----------|-------|-------|-----------------|------------------|------------------|
| Volume | Bookworm | Bronze/Silver/Gold/Star | 5/15/30/50 | 8/25/50/80 | 10/30/60/100 |
| Volume | Time Traveller | Bronze/Silver/Gold | 200/600/1500 min | 400/1200/3000 min | 600/1800/5000 min |
| Consistency | Steady Reader | Single | 3 days in one week | 3 days in one week | 3 days in one week |
| Consistency | Week Warrior | Single | Every day in one week | Every day in one week | Every day in one week |
| Consistency | Monthly Marvel | Single | 4+ days/week for every week in a month (batch, uses `weeks_with_4plus_days`) | same | same |
| Milestone | First Finish | Single | First book with a session | First book with a session | First book with a session |
| Milestone | Series Finisher | Single | 3+ books by same author (batch, needs book join) | same | same |
| Exploration | Genre Explorer | Bronze/Silver/Gold | 3/5/7 genres | 3/5/7 genres | 3/5/7 genres |
| Exploration | Fiction & Fact | Single | Both fiction + nonfiction | Both fiction + nonfiction | Both fiction + nonfiction |
| Secret | Bookworm Bonanza | Single | 3+ sessions in one day | 3+ sessions in one day | 3+ sessions in one day |
| Secret | Weekend Reader | Single | Sat + Sun same weekend (batch, queries sessions) | Sat + Sun same weekend (batch, queries sessions) | Sat + Sun same weekend (batch, queries sessions) |

### Badge naming principles

- **Good**: "Genre Explorer", "Steady Reader", "Poetry Pioneer", "Story Sharer", "New Horizons"
- **Avoid**: "Reading Genius", "Super Brain", "Best Reader", "Top Scholar"
- Unlock messages: informational/celebratory, never obligation-framing

## API Design

### Extended existing endpoints

**`POST /api/students/:id/sessions`** — response gains `newBadges` array:
```json
{
  "session": { "..." },
  "newBadges": [
    { "id": "bookworm_bronze", "name": "Bookworm", "tier": "bronze", "unlockMessage": "You've finished 5 books!..." }
  ]
}
```

Same for `PUT` and `DELETE` on sessions — recalculates stats and re-evaluates.

**`GET /api/students/:id`** — response gains `badges`, `readingStats`, and `nearMisses`:
```json
{
  "student": { "..." },
  "badges": [
    { "badgeId": "bookworm_bronze", "tier": "bronze", "earnedAt": "2026-04-07T10:00:00Z", "notified": false }
  ],
  "readingStats": {
    "totalBooks": 7, "totalMinutes": 340, "totalSessions": 12, "genresRead": ["fiction", "poetry"]
  },
  "nearMisses": [
    { "badgeId": "bookworm_silver", "name": "Bookworm", "tier": "silver", "current": 7, "target": 8, "remaining": 1 }
  ]
}
```

### New endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/students/:id/badges` | Full badge collection: earned, progress for all unevaluated, near-misses |
| `POST` | `/api/students/:id/badges/notify` | Mark badge(s) as notified (teacher has seen the unlock) |

No new public paths — all behind existing JWT auth.

## Frontend Components

### New files

| File | Purpose |
|------|---------|
| `src/routes/badges.js` | `GET /api/students/:id/badges` and `POST /api/students/:id/badges/notify` |
| `src/utils/badgeDefinitions.js` | All badge definitions with evaluate/progress functions |
| `src/utils/badgeEngine.js` | `evaluateRealTime()`, `evaluateBatch()`, `recalculateStats()`, key stage resolution, genre classification mapping |
| `src/components/badges/GardenHeader.js` | SVG garden evolving through 4 stages based on badge count |
| `src/components/badges/BadgeCollection.js` | Grid of earned badges + near-miss progress bars |
| `src/components/badges/BadgeIcon.js` | Single badge circle with tier gradient + category icon |
| `src/components/badges/BadgeCelebration.js` | Unlock modal after session save |
| `src/components/badges/BadgeIndicators.js` | Mini badge row for StudentCard |

### Modified files

| File | Change |
|------|--------|
| `src/worker.js` | Register badge routes, add badge cron at 2:30 AM |
| `src/routes/students.js` | Include badges/stats/near-misses in GET student response. Call `evaluateRealTime()` after session create/update/delete (session handlers are in this file), return `newBadges` |
| `src/utils/rowMappers.js` | Add `rowToBadge`, `rowToReadingStats` mappers |
| `src/components/students/StudentCard.js` | Add `BadgeIndicators` + garden count |
| `src/components/students/StudentDetailDrawer.js` | Add badges section with `GardenHeader` + `BadgeCollection` |
| `src/components/sessions/SessionForm.js` | Handle `newBadges` in save response, show `BadgeCelebration` |
| `src/components/sessions/HomeReadingRegister.js` | Handle `newBadges` from session responses. During bulk register entry, queue badge unlocks and show a single summary toast after saving (not per-session celebrations) |
| `src/contexts/DataContext.js` | Expose badge data from student fetches |
| `wrangler.toml` | Add `30 2 * * *` cron trigger for nightly badge evaluation |

### Garden evolution stages

| Stage | Badge Count | Visual |
|-------|-------------|--------|
| Seedling | 0–2 | Bare soil with a single small seedling, muted tones |
| Sprout | 3–7 | A few small plants, a butterfly, warmer greens |
| Bloom | 8–15 | Flowers, a small tree, a bird, vibrant colours |
| Full Garden | 16+ | Lush garden with trees, flowers, creatures, rich and layered |

SVG components with CSS transitions between stages. MVP uses clean, minimal SVG badge icons with tier colour gradients — richer illustrated badges are a follow-up.

### Tier colours

| Tier | Gradient |
|------|----------|
| Bronze | `#CD7F32 → #A0612A` |
| Silver | `#C0C0C0 → #8A8A8A` |
| Gold | `#FFD700 → #DAA520` |
| Star | `#9B59B6 → #7D3C98` |

### UI surfaces

1. **StudentCard** — garden count badge (`🌿 4`) alongside streak badge, mini badge icon row at bottom
2. **StudentDetailDrawer** — garden header + badge collection grid + near-miss progress bars
3. **Session save response** — celebration modal with badge icon, name, and unlock message

## Testing Strategy

### Unit tests

| File | Coverage |
|------|----------|
| `badgeDefinitions.test.js` | Each badge's `evaluate()` for edge cases. Each `progress()` returns correct current/target. Key stage threshold selection. LowerKS2 fallback for null year_group. |
| `badgeEngine.test.js` | `evaluateRealTime()` awards/skips correctly, returns newly earned. `recalculateStats()` aggregates correctly, handles zero/deleted sessions. Key stage resolution. |
| `rowMappers.test.js` | `rowToBadge` and `rowToReadingStats` null handling, snake_case mapping. |

### Integration tests

| File | Coverage |
|------|----------|
| `badges.test.js` | GET badges returns earned + near-misses. POST notify marks as notified. Session create triggers evaluation and returns `newBadges`. Stats update on create/update/delete. Tenant isolation. |

### Not tested

Garden SVG rendering (visual), celebration modal dismiss (trivial UI). Component tests only if non-trivial logic.

## Future Waves (out of MVP scope)

- **Wave 2**: Social badges (Story Sharer, Book Buddy), seasonal badges (World Book Day, Summer Story)
- **Wave 3**: Printable PDF certificates, class-level badge summary dashboard
- **Wave 4**: Per-school badge toggles, richer illustrated badge artwork, interactive garden
- **Wave 5**: Parent portal badge visibility, collaborative class goals

## Safeguards

1. **Badge fatigue**: MVP has 18 badges — well under the "fewer than 10 earnable per half-term" guideline
2. **Gaming**: Optional teacher verification via existing session notes/assessment fields
3. **Struggling readers**: 9 of 18 MVP badges are achievable through consistency/exploration, not raw volume
4. **No public leaderboards**: Badges are per-student only. Class views (future) will be collaborative goals
5. **Audiobooks count**: Any logged reading session counts, regardless of format
6. **Graceful fade**: Badges are scaffold. No punitive mechanics, no loss conditions
