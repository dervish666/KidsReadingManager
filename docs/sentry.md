# Sentry

Error tracking and performance monitoring for both halves of the app.

| Side     | SDK                  | Init                              | DSN source                     |
| -------- | -------------------- | --------------------------------- | ------------------------------ |
| Frontend | `@sentry/react`      | `src/instrument.js`               | Hardcoded (public by design)   |
| Worker   | `@sentry/cloudflare` | `Sentry.withSentry` in `worker.js`| `env.SENTRY_DSN` (secret)      |

`src/instrument.js` is imported first in `src/index.js` — before React — so the
SDK is installed before any other module can throw. Don't reorder those imports.

## Source maps

**Source maps must never be deployed.** rsbuild builds with `hidden-source-map`,
which omits the `//# sourceMappingURL` comment but *still writes the `.map`
files*. Since `wrangler.toml` deploys the whole `build/` directory, those maps
were previously served publicly — the full unminified source was downloadable
from `https://tallyreading.uk/static/js/*.js.map`, while Sentry had no maps at
all and every stack trace was minified.

`scripts/sentry-release.sh` fixes both halves. It runs between build and deploy
in `npm run go` and in `scripts/build-and-deploy.sh`, and it:

1. Injects **debug IDs** into the JS and its maps (`sentry-cli sourcemaps inject`).
2. Uploads the maps to Sentry and finalizes the release + deploy marker.
3. **Deletes every `.map` from `build/`** — whether or not step 1–2 ran.

Step 3 is unconditional on purpose: a missing auth token must never mean maps
get deployed. Debug IDs are what pair the uploaded maps to incoming stack
frames, so deleting the local maps after upload costs nothing.

### Required environment variables

Upload is skipped (loudly) unless all three are set:

```bash
export SENTRY_AUTH_TOKEN=sntrys_...   # org token with project:releases scope
export SENTRY_ORG=<org-slug>
export SENTRY_PROJECT=<project-slug>
```

Create the token at **Sentry → Settings → Auth Tokens**. Put these in your
shell profile — they're deploy-machine credentials, not app config, so they do
**not** belong in `.env`, `.dev.vars` or `wrangler.toml`.

Without them, `npm run go` still succeeds and still strips the maps; you just
get minified traces for that release.

## Releases

Both sides tag the same release string, `tally-reading@<package.json version>`:

- Frontend: injected at build time by rsbuild `source.define`.
- Worker: injected at deploy time via `wrangler deploy --var APP_VERSION:$npm_package_version`.

Because the deploy flag reads `package.json`, there is no second place to bump —
`/ship` bumps the version and both sides follow.

## Environments

Issues are split by `environment` so a localhost typo can't look like a school
outage:

- **Frontend** derives it from hostname at runtime (`detectEnvironment()` in
  `src/instrument.js`): `tallyreading.uk` → `production`, localhost →
  `development`, anything else → `preview`. Hostname rather than `NODE_ENV`
  because the dev *deploy* is also a production-mode build.
- **Worker** reads `env.ENVIRONMENT` from `[vars]` in `wrangler.toml`.

## User context

`AuthContext` syncs Sentry identity in a single `useEffect` keyed on `user`, so
every auth path (password login, MyLogin SSO, token refresh, logout) is covered
without per-call-site wiring.

Attached: opaque user `id`, `organizationId`, and tags for `organization`,
`role`, `auth_provider`.

**Never attach email or name.** This is a children's-data product;
`scrubSentryEvent` (`src/utils/sentryFilter.js`) redacts PII-shaped keys from
outgoing events as a backstop, but the right fix is not to send them. The school
name is the useful triage dimension — it answers "one school or all of them?"
without identifying a person.

## Cron monitors

Four of the five cron triggers are wrapped in `Sentry.withMonitor`:

| Cron          | Monitor slug              |
| ------------- | ------------------------- |
| `0 2 * * *`   | `streaks-and-gdpr-cleanup`|
| `30 2 * * *`  | `badge-evaluation`        |
| `0 3 * * *`   | `wonde-school-sync`       |
| `0 * * * *`   | `demo-environment-reset`  |

`*/1 * * * *` (metadata enrichment) has **no** monitor by design — it fires
1,440×/day and its normal state is "no job to do", so check-ins would be noise
you'd learn to ignore. Its failures are surfaced with `Sentry.captureException`
instead.

### Long crons must flush explicitly

The scheduled handler ends with `await Sentry.flush(3000)`. The SDK already
registers `waitUntil(flushAndDispose())` of its own accord, but **waitUntil work
is cancelled when an invocation hits its limits**, and these handlers are long.

The evidence: over 24h the fast `*/1` cron produced 1,190 spans (~83% of its
1,440 runs) while the four heavy crons produced **zero**, despite D1 proving they
ran (`wonde_sync_log` has a completed row for every night). Whatever is dropping
those spans also drops the terminal check-in enqueued at the end of a slow job,
which leaves its monitor stuck `in_progress` until Sentry times it out. Don't
remove that flush.

### Thresholds must allow for Cloudflare's cron jitter

Cloudflare cron triggers are best-effort, not punctual. Measured on this account:
the `*/1` cron fires reliably at ~:07 **seconds**, but the hourly `0 * * * *`
fired at **16:07:51 — nearly 8 minutes late**. `checkinMargin` is therefore 15
minutes on every monitor; the original 5 produced "missed" alerts for a job that
was simply waiting on Cloudflare.

`maxRuntime` for `demo-environment-reset` is 15 (not 5) because the reset deletes
across ~20 tables then reseeds ~2,800 rows over ~28 sequential D1 batches.

> **A monitor only goes red if the callback throws.** The badge and demo-reset
> handlers used to `catch` and `console.error` without rethrowing, which would
> have made their monitors check in "ok" on every broken run. If you add a
> monitor to a handler that swallows its errors, rethrow — otherwise you've
> built a smoke alarm with no battery.

### The schedule shape must be `{ type, value }`

```js
schedule: { type: 'crontab', value: '0 3 * * *' }   // correct
schedule: { crontab: '0 3 * * *' }                  // silently dropped
```

The second form was used for every monitor up to v3.114.0. It type-checks
against nothing (this is plain JS), the SDK serializes it happily, and Sentry
rejects the monitor upsert at ingest — so **no monitor is ever created and every
check-in is discarded**. `withMonitor` throws no error and the cron runs
normally, so the only symptom is an empty Crons page.

The `streaks-and-gdpr-cleanup` and `wonde-school-sync` monitors were dead this
way for their entire existence, despite both crons running successfully every
night. Verify a monitor actually exists after adding one — the Sentry Crons
page, or `find_monitors` over the API. Do not assume a green cron means a live
monitor.

## Logging

`consoleLoggingIntegration` is set to `['warn', 'error']` on both sides.
`'log'` is deliberately excluded: `console.log` is used freely as progress
output (the cron handlers especially), and shipping every line burns Sentry log
quota for no diagnostic gain.

## Session Replay

`maskAllText: true` and `blockAllMedia: true` are **intentional** and should
stay. Replays are visually sparse as a result — that's the correct trade for a
product where the screen may show children's names and reading data. Sample
rates are deliberately low (1% of sessions, 10% of errored sessions): replays
run 2–5 MB and school iPads are often on strained wifi.
