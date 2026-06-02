# Configurable Reading-Band Colours — Design Spec

**Date:** 2026-06-02
**Status:** Approved in brainstorming, pending spec review
**Builds on:** Reading Bands (v3.68.0) — `docs/superpowers/specs/2026-06-02-reading-bands-design.md`

## Summary

Let a school admin **view and recolour the 16 reading bands** from the Settings page (under the existing reads-per-band control), with **reset-to-defaults**. Scope, as agreed:

- **Colours only.** Admins pick each band's background colour. Band **names stay fixed** (Lilac/Pink/Red… carry meaning in UK schools). No renaming.
- **Text auto-contrasts.** Label text colour is computed (black/white) from the band colour's luminance — admins never set it. This also generically retires the hand-patched Gold-on-white contrast issue.
- **Per school.** Stored per organization; defaults to the standard ladder until changed.
- **Reset-to-defaults** restores the standard palette.

### Non-goals

- No band renaming, no changing the number of bands (still 16).
- No per-class or per-pupil colours — organization-level only.
- No gradient/image fills (the "Free Reader" gradient in mockups is display-only flourish; the stored value is a solid hex like every other band).

## Architecture decision

Colours resolve today through three pure functions — `getBandByIndex` (in `readingBandDefinitions.js`) and `bandForCount` / `bandTransition` (in `readingBandEngine.js`, which call it). The **server already embeds resolved colours** into the parent-portal `band` payload and both `bandUp` transitions; the **teacher chips resolve client-side** via `getBandByIndex`.

**Chosen approach: palette-aware resolver with a per-context override source.** Give those functions an optional `palette` argument (array of 16 hex strings). Load the override once per context — the server in `getOrgBandSettings`, the client from `useData().settings` — and thread it through. This is the minimal, consistent extension: server-embedded colours reflect overrides with **no payload-shape change**, and only the teacher chips need the palette from context.

Rejected: embedding a colour on every student API row (redundant — same 16 colours repeated per student); client-only resolution (the standalone token-auth parent portal has no settings context, so it would need the palette in its payload anyway, and it reworks the current server-resolved behaviour).

## Data model

New `org_settings` key (the existing key-value settings table):

| Key | Value | Default |
|---|---|---|
| `bandColors` | JSON array of exactly 16 `#RRGGBB` strings, index-aligned to the ladder (0=Lilac … 15=Free Reader) | absent → the standard ladder colours |

- The editor always saves the **full 16-element array** (default-seeded), so storage is simple and index-aligned.
- `validateSettings` (`src/utils/validation.js`) rejects a `bandColors` that isn't an array of exactly 16 strings each matching `/^#[0-9A-Fa-f]{6}$/`.

## Components & changes

### 1. `src/utils/readingBandDefinitions.js` (resolver + auto-contrast)

- Add `DEFAULT_BAND_COLORS` — the 16 default hex colours (derived from `READING_BAND_LADDER`, single source).
- Add a pure `pickTextColor(hex)` → returns `#3A352E` (dark) or `#FFFFFF` (white) by relative luminance (WCAG-style: compute luminance, threshold ~0.5). Guarantees readable text on any chosen colour.
- Extend `getBandByIndex(i, palette)` (optional `palette`): returns `{ index, name, color, textColor }` where `color = palette?.[i] ?? DEFAULT_BAND_COLORS[i]` and `textColor = pickTextColor(color)`. The static `textColor` field on `READING_BAND_LADDER` becomes vestigial (computed now); leave the array as-is for `name`/default `color`, but resolution always computes `textColor`.
- `READING_BAND_COUNT`, `DEFAULT_READS_PER_BAND`, the ladder export — unchanged.

### 2. `src/utils/readingBandEngine.js` (thread the palette)

- `bandForCount(readsCount, readsPerBand, palette)` — passes `palette` to `getBandByIndex`.
- `bandTransition(fromIndex, toIndex, palette)` — passes `palette` to both `getBandByIndex` calls.
- `computeBandIndex`, `academicYearStart`, `readContribution`, `countReads` — unchanged.

### 3. Server (`getOrgBandSettings` + call sites)

- `src/routes/students/_shared.js` — `getOrgBandSettings` also reads/returns `bandColors` (validated to 16 hex, else default), KV-cached alongside `readsPerBand` under `org-band-settings:<org>`. `updateStudentBand`'s `bandTransition(previousBand, currentBand, bandColors)` call passes the palette so the teacher `bandUp` carries overridden colours.
- `src/routes/parent.js` — the GET handler already destructures `readsPerBand` from `getOrgBandSettings`; also take `bandColors` and pass it into `bandForCount(bandReadsCount, readsPerBand, bandColors)` and `decideParentBandCelebration` → `bandTransition(marker, current, bandColors)`. (Add an optional `palette` param to `decideParentBandCelebration` so it forwards to `bandTransition`.)

### 4. Client (`settings` GET already passes unknown keys through)

- The settings GET returns all `org_settings` rows verbatim (confirmed during the band feature), so `bandColors` flows to `useData().settings.bandColors` with no GET change.
- `src/components/students/ReadingBandChip.js` — `ReadingBandChip({ bandIndex, size, palette })` and `ReadingBandProgress({ readsCount, readsPerBand, palette })` accept an optional `palette` and pass it to `getBandByIndex`/`bandForCount`. Call sites (`StudentCard`, `StudentReadView`, `StudentTable`) pass `settings?.bandColors` from `useData()` (they already read `settings` or can).
- Celebrations (`BandCelebration`, parent portal) — **no change**; they render server-resolved colours which now reflect overrides.

### 5. Settings editor (`src/components/Settings.js`)

Under the reads-per-band field in the "Reading Bands" section:
- A grid of 16 entries, each: the band name + a native `<input type="color">` bound to `localSettings.bandColors[i]` (seeded from `settings?.bandColors ?? DEFAULT_BAND_COLORS`).
- A **Reset to defaults** button that sets `bandColors` back to `DEFAULT_BAND_COLORS`.
- Saved via the existing settings save handler (include `bandColors` in the POST body, like `readsPerBand`).
- The settings route (`src/routes/settings.js`) adds `'bandColors'` to its allowlist and invalidates the `org-band-settings:<org>` KV key on a PUT that includes it (extend the existing readsPerBand invalidation).

## Data flow

```
Admin edits swatches in Settings → save → POST /settings { bandColors:[16 hex] }
   → validateSettings (16 × #RRGGBB) → org_settings upsert → KV org-band-settings:<org> invalidated
Teacher views card/table/detail → useData().settings.bandColors → ReadingBandChip(palette) → getBandByIndex(i, palette)
Session write → updateStudentBand → bandTransition(prev,cur, bandColors) → bandUp carries overridden colours → BandCelebration
Parent portal GET → getOrgBandSettings → bandForCount(reads, perBand, bandColors) + bandTransition(...) → band/bandUp carry overridden colours
```

## Testing

- **`pickTextColor`** — Gold `#D4AF37` → dark; Dark Blue `#1F3A93` → white; White `#FFFFFF` → dark; black → white; a mid-luminance boundary case.
- **`getBandByIndex(i, palette)`** — with palette override returns the overridden colour + auto-contrast text; without palette returns defaults; out-of-range still clamps.
- **`bandForCount` / `bandTransition` with palette** — colours come from the palette.
- **`validateSettings`** — accepts 16 valid hex; rejects wrong length, non-hex, non-array.
- **Settings round-trip** — `bandColors` persists and is returned by the GET.

## Files touched (estimate)

- **Edit:** `src/utils/readingBandDefinitions.js`, `src/utils/readingBandEngine.js`, `src/routes/students/_shared.js`, `src/routes/parent.js`, `src/routes/settings.js`, `src/utils/validation.js`, `src/components/students/ReadingBandChip.js`, `src/components/students/{StudentCard,StudentReadView,StudentTable}.js`, `src/components/Settings.js`.
- **Tests:** extend `readingBandEngine.test.js` / `readingBandDefinitions.test.js`; add `pickTextColor` + palette cases; a `validateSettings` bandColors case.
- **No migration** — `bandColors` is a key in the existing `org_settings` table.

## Open questions (none blocking)

- Editor layout density (4×4 grid vs a list) — settle visually during implementation; either is fine.
- Whether to also show a live preview chip next to each picker — nice-to-have, not required for v1.
