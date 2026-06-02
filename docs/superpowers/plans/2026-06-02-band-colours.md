# Configurable Reading-Band Colours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a school admin recolour the 16 reading bands from Settings (under reads-per-band), with reset-to-defaults; label text auto-contrasts; overrides flow to every band surface (teacher chips, parent portal, celebrations).

**Architecture:** Colours resolve through three pure functions (`getBandByIndex`, `bandForCount`, `bandTransition`) that gain an optional `palette` argument. The override (`bandColors`, a 16-hex array) is stored in the existing key-value `org_settings` table and loaded once per context — server via `getOrgBandSettings`, client via `useData().settings`. Server-embedded colours (parent portal, both `bandUp` celebrations) reflect overrides with no payload-shape change; only the teacher chips read the palette client-side. Text colour is computed from the band colour by contrast ratio (auto-contrast), retiring the hand-set values.

**Tech Stack:** Cloudflare Workers + Hono, D1 (SQLite), React 19 + MUI v7, Vitest. Plain JS.

**Spec:** `docs/superpowers/specs/2026-06-02-band-colours-design.md`

---

## File Structure

**Edit only — no new files, no migration** (`bandColors` is a key in the existing `org_settings` table):
- `src/utils/readingBandDefinitions.js` — `DEFAULT_BAND_COLORS`, `pickTextColor`, palette-aware `getBandByIndex`.
- `src/utils/readingBandEngine.js` — `bandForCount` / `bandTransition` thread `palette`.
- `src/utils/validation.js` — `validateSettings` bounds `bandColors`.
- `src/routes/students/_shared.js` — `getOrgBandSettings` returns `bandColors`; `updateStudentBand` passes it.
- `src/routes/parent.js` — GET passes `bandColors`; `decideParentBandCelebration` forwards a palette.
- `src/routes/settings.js` — allowlist + KV invalidation for `bandColors`.
- `src/components/students/ReadingBandChip.js` — `palette` prop on both exports.
- `src/components/students/{StudentCard,StudentReadView,StudentTable}.js` — pass `settings?.bandColors`.
- `src/components/Settings.js` — the colour editor.
- Tests: extend `readingBandDefinitions.test.js`, `readingBandEngine.test.js`, `readingBandUpdate.test.js`, `parentBand.test.js`, `validation.test.js`.

---

## Task 1: Auto-contrast + palette-aware band resolver

**Files:**
- Modify: `src/utils/readingBandDefinitions.js`
- Test: `src/__tests__/unit/readingBandDefinitions.test.js`

- [ ] **Step 1: Add the failing tests** (append to the existing describe file)

```javascript
import {
  DEFAULT_BAND_COLORS,
  pickTextColor,
} from '../../utils/readingBandDefinitions.js';

describe('pickTextColor (auto-contrast)', () => {
  it('picks dark text on light/mid colours', () => {
    expect(pickTextColor('#FFFFFF')).toBe('#3A352E'); // white bg
    expect(pickTextColor('#D4AF37')).toBe('#3A352E'); // Gold — the contrast fix
    expect(pickTextColor('#F4D03F')).toBe('#3A352E'); // Yellow
  });
  it('picks white text on dark colours', () => {
    expect(pickTextColor('#000000')).toBe('#FFFFFF');
    expect(pickTextColor('#1F3A93')).toBe('#FFFFFF'); // Dark Blue
    expect(pickTextColor('#2E86DE')).toBe('#FFFFFF'); // Blue — proves ratio method beats a naive threshold
  });
  it('falls back to dark text on bad input', () => {
    expect(pickTextColor('not-a-colour')).toBe('#3A352E');
    expect(pickTextColor(null)).toBe('#3A352E');
  });
});

describe('DEFAULT_BAND_COLORS', () => {
  it('is the 16 ladder colours in order', () => {
    expect(DEFAULT_BAND_COLORS).toHaveLength(16);
    expect(DEFAULT_BAND_COLORS[0]).toBe('#C8A2C8');
    expect(DEFAULT_BAND_COLORS[15]).toBe('#6B4FA0');
  });
});

describe('getBandByIndex with palette', () => {
  it('uses the palette colour and auto-contrast text when given', () => {
    const palette = [...DEFAULT_BAND_COLORS];
    palette[2] = '#000000'; // recolour Red to black
    const b = getBandByIndex(2, palette);
    expect(b.color).toBe('#000000');
    expect(b.textColor).toBe('#FFFFFF');
    expect(b.name).toBe('Red');
  });
  it('falls back to default colour without a palette', () => {
    const b = getBandByIndex(9); // Gold
    expect(b.color).toBe('#D4AF37');
    expect(b.textColor).toBe('#3A352E'); // computed, not the old #FFFFFF
  });
  it('ignores a malformed palette entry and uses the default', () => {
    const b = getBandByIndex(2, ['bad']);
    expect(b.color).toBe('#D7263D');
  });
});
```

- [ ] **Step 2: Run, confirm FAIL**

Run: `npx vitest run src/__tests__/unit/readingBandDefinitions.test.js`
Expected: FAIL — `pickTextColor` / `DEFAULT_BAND_COLORS` not exported; `getBandByIndex` ignores palette.

- [ ] **Step 3: Implement** in `src/utils/readingBandDefinitions.js`

Add after `READING_BAND_LADDER` / `DEFAULT_READS_PER_BAND`:

```javascript
export const DEFAULT_BAND_COLORS = READING_BAND_LADDER.map((b) => b.color);

const DARK_TEXT = '#3A352E';
const LIGHT_TEXT = '#FFFFFF';
const HEX6 = /^#?[0-9A-Fa-f]{6}$/;

// WCAG relative luminance of a #RRGGBB colour (0..1).
function relativeLuminance(hex) {
  const c = String(hex == null ? '' : hex).replace('#', '');
  const toLin = (pair) => {
    const s = parseInt(pair, 16) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLin(c.slice(0, 2)) + 0.7152 * toLin(c.slice(2, 4)) + 0.0722 * toLin(c.slice(4, 6));
}

function contrastRatio(l1, l2) {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Best-contrast text colour for a band background. Compares the ACTUAL
 * contrast ratio of the background against the two real text colours
 * (#3A352E dark, #FFFFFF white) and returns the higher — a luminance
 * threshold alone misclassifies mid-tones like Gold and Blue.
 */
export function pickTextColor(hex) {
  if (!HEX6.test(String(hex || ''))) return DARK_TEXT;
  const bg = relativeLuminance(hex);
  const darkL = relativeLuminance(DARK_TEXT);
  const lightL = 1.0; // white
  return contrastRatio(bg, lightL) >= contrastRatio(bg, darkL) ? LIGHT_TEXT : DARK_TEXT;
}
```

Then replace `getBandByIndex` with the palette-aware, auto-contrast version:

```javascript
export const getBandByIndex = (i, palette) => {
  const clamped = Math.max(0, Math.min(Number(i) || 0, READING_BAND_COUNT - 1));
  const base = READING_BAND_LADDER[clamped];
  const override = Array.isArray(palette) ? palette[clamped] : null;
  const color = HEX6.test(String(override || '')) ? override : base.color;
  return { index: base.index, name: base.name, color, textColor: pickTextColor(color) };
};
```

- [ ] **Step 4: Run, confirm PASS** (new + existing definitions tests)

Run: `npx vitest run src/__tests__/unit/readingBandDefinitions.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/readingBandDefinitions.js src/__tests__/unit/readingBandDefinitions.test.js
git commit -m "feat(band-colours): palette-aware getBandByIndex + auto-contrast pickTextColor"
```

---

## Task 2: Thread the palette through the engine

**Files:**
- Modify: `src/utils/readingBandEngine.js`
- Test: `src/__tests__/unit/readingBandEngine.test.js`

- [ ] **Step 1: Add failing tests**

```javascript
import { DEFAULT_BAND_COLORS } from '../../utils/readingBandDefinitions.js';

describe('palette threading', () => {
  it('bandForCount uses the palette colour', () => {
    const palette = [...DEFAULT_BAND_COLORS];
    palette[2] = '#111111';
    const b = bandForCount(47, 20, palette); // 47 reads -> band 2 (Red)
    expect(b.color).toBe('#111111');
    expect(b.textColor).toBe('#FFFFFF');
  });
  it('bandTransition uses the palette colours', () => {
    const palette = [...DEFAULT_BAND_COLORS];
    palette[4] = '#222222';
    const t = bandTransition(2, 4, palette);
    expect(t.to.color).toBe('#222222');
  });
  it('works without a palette (defaults)', () => {
    expect(bandForCount(47, 20).color).toBe('#D7263D');
  });
});
```

- [ ] **Step 2: Run, confirm FAIL**

Run: `npx vitest run src/__tests__/unit/readingBandEngine.test.js`
Expected: FAIL — palette colour ignored.

- [ ] **Step 3: Implement** — add the optional `palette` param to both functions in `src/utils/readingBandEngine.js`:

```javascript
export function bandForCount(readsCount, readsPerBand = DEFAULT_READS_PER_BAND, palette) {
  const per = effectivePer(readsPerBand);
  const count = Number(readsCount) || 0;
  const index = computeBandIndex(count, per);
  const band = getBandByIndex(index, palette);
  const atTop = index >= READING_BAND_COUNT - 1;
  const nextAt = atTop ? null : (index + 1) * per;
  const toNext = atTop ? null : nextAt - count;
  return { ...band, readsCount: count, readsPerBand: per, nextAt, toNext, atTop };
}

export function bandTransition(fromIndex, toIndex, palette) {
  return { from: getBandByIndex(fromIndex, palette), to: getBandByIndex(toIndex, palette) };
}
```

- [ ] **Step 4: Run, confirm PASS**

Run: `npx vitest run src/__tests__/unit/readingBandEngine.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/readingBandEngine.js src/__tests__/unit/readingBandEngine.test.js
git commit -m "feat(band-colours): thread palette through bandForCount/bandTransition"
```

---

## Task 3: Validate `bandColors` server-side

**Files:**
- Modify: `src/utils/validation.js` (`validateSettings`)
- Test: `src/__tests__/unit/validation.test.js`

- [ ] **Step 1: Add failing tests**

```javascript
// in validation.test.js — import { validateSettings } already present or add it
describe('validateSettings bandColors', () => {
  const ok = Array.from({ length: 16 }, () => '#AABBCC');
  it('accepts 16 valid hex colours', () => {
    expect(validateSettings({ bandColors: ok }).isValid).toBe(true);
  });
  it('rejects wrong length', () => {
    expect(validateSettings({ bandColors: ok.slice(0, 15) }).isValid).toBe(false);
  });
  it('rejects a non-hex entry', () => {
    const bad = [...ok];
    bad[3] = 'red';
    expect(validateSettings({ bandColors: bad }).isValid).toBe(false);
  });
  it('rejects a non-array', () => {
    expect(validateSettings({ bandColors: '#AABBCC' }).isValid).toBe(false);
  });
});
```

- [ ] **Step 2: Run, confirm FAIL**

Run: `npx vitest run src/__tests__/unit/validation.test.js`
Expected: FAIL — bad bandColors currently passes.

- [ ] **Step 3: Implement** — in `src/utils/validation.js`, immediately before the final `return { isValid: errors.length === 0, errors };` of `validateSettings`, add:

```javascript
  // Validate band colour palette if provided
  if (settings.bandColors !== undefined) {
    const hex = /^#[0-9A-Fa-f]{6}$/;
    if (
      !Array.isArray(settings.bandColors) ||
      settings.bandColors.length !== 16 ||
      !settings.bandColors.every((c) => typeof c === 'string' && hex.test(c))
    ) {
      errors.push('Band colours must be an array of exactly 16 hex colours (#RRGGBB)');
    }
  }
```

- [ ] **Step 4: Run, confirm PASS**

Run: `npx vitest run src/__tests__/unit/validation.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/validation.js src/__tests__/unit/validation.test.js
git commit -m "feat(band-colours): validate bandColors (16 hex) in settings"
```

---

## Task 4: Server reads + applies the palette

**Files:**
- Modify: `src/routes/students/_shared.js` (`getOrgBandSettings`, `updateStudentBand`)
- Modify: `src/routes/parent.js` (`decideParentBandCelebration`, the GET handler)
- Test: `src/__tests__/unit/readingBandUpdate.test.js`, `src/__tests__/unit/parentBand.test.js`

- [ ] **Step 1: Add failing tests**

In `src/__tests__/unit/parentBand.test.js`:
```javascript
import { DEFAULT_BAND_COLORS } from '../../utils/readingBandDefinitions.js';

describe('decideParentBandCelebration palette', () => {
  it('colours the transition from the palette', () => {
    const palette = [...DEFAULT_BAND_COLORS];
    palette[4] = '#123456';
    const r = decideParentBandCelebration(2, 4, palette);
    expect(r.bandUp.to.color).toBe('#123456');
  });
});
```

In `src/__tests__/unit/readingBandUpdate.test.js`, extend the mock so `getOrgBandSettings`'s `bandColors` query (a `.first()` returning `setting_value`) can be exercised; add:
```javascript
import { getOrgBandSettings } from '../../routes/students/_shared.js';

describe('getOrgBandSettings bandColors', () => {
  it('returns default palette when unset', async () => {
    const db = {
      prepare: () => ({ bind: () => ({ first: async () => null }) }),
      batch: async () => [{ results: [] }, { results: [] }],
    };
    const s = await getOrgBandSettings(db, 'org1', {});
    expect(s.readsPerBand).toBe(20);
    expect(Array.isArray(s.bandColors)).toBe(true);
    expect(s.bandColors).toHaveLength(16);
  });
});
```

- [ ] **Step 2: Run, confirm FAIL**

Run: `npx vitest run src/__tests__/unit/parentBand.test.js src/__tests__/unit/readingBandUpdate.test.js`
Expected: FAIL — `decideParentBandCelebration` ignores palette; `getOrgBandSettings` returns no `bandColors`.

- [ ] **Step 3a: `getOrgBandSettings`** — in `src/routes/students/_shared.js`, import the default palette at the top (merge into the existing readingBandDefinitions import):

```javascript
import { DEFAULT_READS_PER_BAND, DEFAULT_BAND_COLORS } from '../../utils/readingBandDefinitions.js';
```

Replace the body of `getOrgBandSettings` so it reads BOTH keys and returns `bandColors` (validated to a 16-hex array, else default). Keep the KV cache key `org-band-settings:<id>`:

```javascript
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

  const [rpbRes, colorsRes] = await db.batch([
    db
      .prepare(
        `SELECT setting_value FROM org_settings WHERE organization_id = ? AND setting_key = 'readsPerBand'`
      )
      .bind(organizationId),
    db
      .prepare(
        `SELECT setting_value FROM org_settings WHERE organization_id = ? AND setting_key = 'bandColors'`
      )
      .bind(organizationId),
  ]);

  let readsPerBand = DEFAULT_READS_PER_BAND;
  const rpbRow = rpbRes?.results?.[0];
  if (rpbRow?.setting_value) {
    try {
      const parsed = parseInt(JSON.parse(rpbRow.setting_value), 10);
      if (parsed > 0) readsPerBand = parsed;
    } catch {
      /* default */
    }
  }

  let bandColors = DEFAULT_BAND_COLORS;
  const colorsRow = colorsRes?.results?.[0];
  if (colorsRow?.setting_value) {
    try {
      const parsed = JSON.parse(colorsRow.setting_value);
      const hex = /^#[0-9A-Fa-f]{6}$/;
      if (Array.isArray(parsed) && parsed.length === 16 && parsed.every((c) => hex.test(c))) {
        bandColors = parsed;
      }
    } catch {
      /* default */
    }
  }

  const settings = { readsPerBand, bandColors };
  if (KV) {
    try {
      await KV.put(cacheKey, JSON.stringify(settings), { expirationTtl: 3600 });
    } catch {
      /* non-critical */
    }
  }
  return settings;
};
```

> Note: this switches the single `.first()` read to a `db.batch([...])` of two queries. The `readingBandUpdate.test.js` mock must provide a `batch` method (see the test above). The existing `updateStudentBand` tests mock `prepare().bind().first/all/run` — add a `batch` to that mock returning `[{results:[]},{results:[]}]` so `getOrgBandSettings` falls back to defaults there too.

- [ ] **Step 3b: `updateStudentBand`** — pass the palette to the transition. In `src/routes/students/_shared.js`, change the destructure and the `bandTransition` call:

```javascript
  const { readsPerBand, bandColors } = await getOrgBandSettings(db, organizationId, env || {});
```
```javascript
  const bandUp = currentBand > previousBand ? bandTransition(previousBand, currentBand, bandColors) : null;
```

- [ ] **Step 3c: `parent.js`** — give `decideParentBandCelebration` an optional palette and use it in the GET.

Change the helper signature + body:
```javascript
export function decideParentBandCelebration(marker, currentBand, palette) {
  const current = currentBand || 0;
  if (marker === null || marker === undefined) {
    return { bandUp: null, newSeen: current };
  }
  if (current > marker) {
    return { bandUp: bandTransition(marker, current, palette), newSeen: current };
  }
  return { bandUp: null, newSeen: marker };
}
```

In the GET handler, change the settings destructure and the two band calls to thread `bandColors`:
```javascript
    const { readsPerBand, bandColors } = await getOrgBandSettings(db, organizationId, c.env || {});
```
```javascript
    const { bandUp, newSeen } = decideParentBandCelebration(
      tokenRow.parent_last_seen_band,
      currentBand,
      bandColors
    );
```
```javascript
    const band = bandForCount(bandReadsCount, readsPerBand, bandColors);
```

- [ ] **Step 4: Run, confirm PASS** (+ full suite for no regression)

Run: `npx vitest run src/__tests__/unit/parentBand.test.js src/__tests__/unit/readingBandUpdate.test.js && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/students/_shared.js src/routes/parent.js src/__tests__/unit/parentBand.test.js src/__tests__/unit/readingBandUpdate.test.js
git commit -m "feat(band-colours): server reads bandColors and applies palette to all band payloads"
```

---

## Task 5: Settings route — allow + cache-invalidate `bandColors`

**Files:**
- Modify: `src/routes/settings.js`

- [ ] **Step 1: Inspect the readsPerBand plumbing**

Run: `grep -n "readsPerBand\|allowedKeys\|org-band-settings\|allowed" src/routes/settings.js`
Confirm the `allowedKeys` array (it contains `'readsPerBand'`) and the KV-invalidation block added for `readsPerBand`.

- [ ] **Step 2: Implement** — mirror `readsPerBand` exactly:
  1. Add `'bandColors'` to the `allowedKeys` array (next to `'readsPerBand'`).
  2. Where a PUT with `readsPerBand` deletes `org-band-settings:<org>` from KV, extend the condition so a PUT with `bandColors` also invalidates it. The cache key is shared, so:

```javascript
if (
  (body.readsPerBand !== undefined || body.bandColors !== undefined) &&
  c.env.READING_MANAGER_KV
) {
  try {
    await c.env.READING_MANAGER_KV.delete(`org-band-settings:${organizationId}`);
  } catch {
    /* non-critical */
  }
}
```
(Adapt to the exact shape already in the file — if there's a dedicated `readsPerBand` invalidation line, broaden its guard to include `bandColors` rather than adding a second delete of the same key.)

- [ ] **Step 3: Verify**

Run: `npm run build && npx vitest run`
Expected: build OK, suite green. (No new unit test here — covered by Task 3 validation + the round-trip in Task 8.)

- [ ] **Step 4: Commit**

```bash
git add src/routes/settings.js
git commit -m "feat(band-colours): allow + cache-invalidate bandColors setting"
```

---

## Task 6: Client chips read the palette

**Files:**
- Modify: `src/components/students/ReadingBandChip.js`
- Modify: `src/components/students/StudentCard.js`, `StudentReadView.js`, `StudentTable.js`

- [ ] **Step 1: Add the `palette` prop to both exports** in `src/components/students/ReadingBandChip.js`:

```jsx
export function ReadingBandChip({ bandIndex = 0, size = 'small', palette }) {
  const band = getBandByIndex(bandIndex, palette);
  // …unchanged render, but use band.color AND band.textColor for the text:
```
Ensure the chip uses the resolved `band.textColor` for its `color:` (it already reads `band.color`; confirm `color: band.textColor` is used for the label text so auto-contrast applies).

```jsx
export function ReadingBandProgress({ readsCount = 0, readsPerBand = 20, palette }) {
  const band = bandForCount(readsCount, readsPerBand, palette);
  // …unchanged; the "to next" name lookup can stay getBandByIndex(band.index + 1).name (names aren't themed).
```

- [ ] **Step 2: Pass `settings?.bandColors` at the call sites**

- `StudentReadView.js` already destructures `settings` from `useData()`. Change its progress render:
```jsx
<ReadingBandProgress
  readsCount={student.bandReadsCount || 0}
  readsPerBand={settings?.readsPerBand ?? 20}
  palette={settings?.bandColors}
/>
```
- `StudentTable.js` already calls `useData()`. Destructure `settings` if not already, and pass to the chip:
```jsx
<ReadingBandChip bandIndex={student.currentBand || 0} palette={settings?.bandColors} />
```
- `StudentCard.js` — `StudentCard` is `React.memo(({ student }))` and does not currently use `useData()`. Add `import { useData } from '../../contexts/DataContext';`, read `const { settings } = useData();` at the top of the component, and pass the palette:
```jsx
<ReadingBandChip bandIndex={student.currentBand || 0} size="small" palette={settings?.bandColors} />
```

- [ ] **Step 3: Verify**

Run: `npm run build && npx vitest run`
Expected: build OK, suite green. (Components have no dedicated render tests; the build is the compile gate, palette logic is unit-tested in Tasks 1–2.)

- [ ] **Step 4: Commit**

```bash
git add src/components/students/ReadingBandChip.js src/components/students/StudentCard.js src/components/students/StudentReadView.js src/components/students/StudentTable.js
git commit -m "feat(band-colours): teacher band chips honour the org palette"
```

---

## Task 7: Settings colour editor

**Files:**
- Modify: `src/components/Settings.js`

- [ ] **Step 1: Inspect the existing Reading Bands section**

Run: `grep -n "readsPerBand\|localSettings\|handleSave\|handleReset\|Reading Bands\|MenuBookIcon" src/components/Settings.js`
Note where `readsPerBand` is seeded into state (initial, reset, save body) and where the "Reading Bands" section renders.

- [ ] **Step 2: Implement the editor** in the "Reading Bands" section, under the reads-per-band field.

Import the defaults at the top:
```jsx
import { DEFAULT_BAND_COLORS, READING_BAND_LADDER } from '../utils/readingBandDefinitions';
```
Seed `bandColors` into `localSettings` everywhere `readsPerBand` is seeded (initial state, reset handler, save body), defaulting to the org value or `DEFAULT_BAND_COLORS`:
```jsx
bandColors: settings?.bandColors ?? DEFAULT_BAND_COLORS,
```
Render the swatch grid + reset button below the reads-per-band input:
```jsx
<Box sx={{ mt: 2 }}>
  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Band colours</Typography>
    <Button
      size="small"
      onClick={() => setLocalSettings((s) => ({ ...s, bandColors: [...DEFAULT_BAND_COLORS] }))}
    >
      Reset to defaults
    </Button>
  </Box>
  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5 }}>
    {READING_BAND_LADDER.map((band, i) => (
      <Box key={band.index} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
        <input
          type="color"
          aria-label={`${band.name} band colour`}
          value={(localSettings.bandColors || DEFAULT_BAND_COLORS)[i]}
          onChange={(e) =>
            setLocalSettings((s) => {
              const next = [...(s.bandColors || DEFAULT_BAND_COLORS)];
              next[i] = e.target.value;
              return { ...s, bandColors: next };
            })
          }
          style={{ width: 40, height: 28, border: 'none', background: 'none', cursor: 'pointer' }}
        />
        <Typography variant="caption" color="text.secondary">{band.name}</Typography>
      </Box>
    ))}
  </Box>
</Box>
```
Confirm the save handler includes `bandColors: localSettings.bandColors` in the POST body (add it next to `readsPerBand`).

> Match the file's actual state-management names (`localSettings`/`setLocalSettings` are from the band feature; if they differ, use the real ones).

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: build OK. Manually: open Settings → Reading Bands, change a swatch, save, reload — the colour persists and the chips/parent portal reflect it.

- [ ] **Step 4: Commit**

```bash
git add src/components/Settings.js
git commit -m "feat(band-colours): Settings editor — 16 swatches + reset to defaults"
```

---

## Task 8: Full verification

- [ ] **Step 1: CI-parity gates**

Run:
```bash
npx prettier --check "src/**/*.js"
npm run lint
npx vitest run
npm run build
```
Expected: prettier clean (run `--write` on touched files if not), lint 0 errors, all tests pass, build OK.

- [ ] **Step 2: Manual round-trip (local worker)**

Change a band colour in Settings, save, and confirm: the teacher card/table/detail chip recolours; logging a read across a threshold celebrates in the new colour; the parent portal band + celebration use the new colour; Reset-to-defaults restores the standard palette. Confirm `bandColors` persists:
```bash
npx wrangler d1 execute reading-manager-db --local \
  --command "SELECT setting_value FROM org_settings WHERE setting_key='bandColors';"
```

- [ ] **Step 3: Final commit (if formatting fixups)**

```bash
git add -A
git commit -m "chore(band-colours): formatting + final verification"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Colours-only, names fixed → no rename anywhere; only colours editable (T1, T7). ✓
- Auto-contrast text → `pickTextColor` by contrast ratio (T1), used in `getBandByIndex` (all surfaces). ✓
- Per-school storage in `org_settings.bandColors` (16 hex), validated → T3, T4 (`getOrgBandSettings`), T5 (allowlist). ✓
- Reset-to-defaults → T7 button. ✓
- Palette reaches all surfaces: teacher chips (T6, client), parent portal + both `bandUp` celebrations (T4, server). ✓
- KV invalidation on change → T5. ✓
- No migration → confirmed (org_settings key). ✓

**Placeholder scan:** none. Tasks 5/6/7 instruct matching existing names but supply the exact code and a `grep` to anchor — integration checks, not missing logic.

**Type/name consistency:** `palette` is the optional last arg on `getBandByIndex` (T1), `bandForCount`/`bandTransition` (T2), `decideParentBandCelebration` (T4); `bandColors` is the org-settings key + the array shape throughout; `DEFAULT_BAND_COLORS`/`pickTextColor` defined in T1 and consumed in T4/T6/T7. Consistent.
