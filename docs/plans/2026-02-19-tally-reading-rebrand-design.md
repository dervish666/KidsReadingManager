# Tally Reading Rebrand Design

**Date**: 2026-02-19
**Domain**: tallyreading.uk
**Approach**: Single-pass full rebrand (Approach 1)

## Decisions

- **Brand name**: "Tally Reading"
- **Scope**: Full rebrand — all references renamed
- **Domain**: Add tallyreading.uk alongside reading.brisflix.com (transition period)
- **Visual**: Name change only, keep existing MUI look and feel
- **Worker name**: Keep `kids-reading-manager` internally (avoid redeployment risk)
- **Database name**: Keep `reading-manager-db` (invisible to users, changing requires DB recreation)
- **R2/KV bindings**: Keep as-is (generic names, not branded)

## User-Facing Text Changes

All "Kids Reading Manager" becomes "Tally Reading":

| File | Change |
|------|--------|
| `src/components/Header.js` | App header text |
| `src/components/Login.js` | Login page title |
| `public/index.html` | `<title>` and meta description |
| `public/manifest.json` | PWA `name` and `short_name` |
| `rsbuild.config.mjs` | `config.title` |
| `src/worker.js` | Health check message |

### Email Templates (`src/utils/email.js`)

- Subject lines: "Reset your Tally Reading password"
- Body text: "Welcome to Tally Reading!"
- Signature: "- The Tally Reading Team"
- Header HTML: `<h1>Tally Reading</h1>`

### Backup Filename (`src/contexts/AppContext.js`)

- `reading-manager-backup-...` -> `tally-reading-backup-...`

## Infrastructure & Config

| File | Field | Old | New |
|------|-------|-----|-----|
| `package.json` | `name` | `kids-reading-manager-cloudflare` | `tally-reading` |
| `package.json` | `description` | "...Kids Reading Manager API" | "...Tally Reading API" |
| `wrangler.toml` | routes | (add) | `{ pattern = "tallyreading.uk/*", zone_name = "tallyreading.uk" }` |
| `wrangler.toml` | `ALLOWED_ORIGINS` | (append) | `https://tallyreading.uk` |
| `LICENSE` | copyright | "Kids Reading Manager" | "Tally Reading" |

Worker name (`kids-reading-manager`) and database name (`reading-manager-db`) remain unchanged.

## Documentation

All docs updated to replace "Kids Reading Manager" with "Tally Reading":

- `README.md`, `CLAUDE.md`, `CHANGELOG.md`, `INSTRUCTIONS.md`
- `docs/scaling.md`, `docs/plans/*.md`
- `cline_docs/cloudflare_worker_implementation.md`
- `public/ICON-INSTRUCTIONS.md`
- `.serena/project.yml`

## Tests

String expectations updated to match new brand name:

- `src/__tests__/unit/email.test.js` — ~6 assertions
- `src/__tests__/components/Login.test.jsx` — 1 assertion

## Domain Setup (Manual)

1. Add DNS record for `tallyreading.uk` pointing to worker (Cloudflare dashboard)
2. Worker route in `wrangler.toml` handles request routing
3. SSL handled automatically by Cloudflare
4. Keep `reading.brisflix.com` route until transition complete
