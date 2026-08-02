# Sentry

Error tracking and performance monitoring for both halves of the app.

| Side     | SDK                  | Init                               | DSN source                   |
| -------- | -------------------- | ---------------------------------- | ---------------------------- |
| Frontend | `@sentry/react`      | `src/instrument.js`                | Hardcoded (public by design) |
| Worker   | `@sentry/cloudflare` | `Sentry.withSentry` in `worker.js` | `env.SENTRY_DSN` (secret)    |

`src/instrument.js` is imported first in `src/index.js` — before React — so the
SDK is installed before any other module can throw. Don't reorder those imports.

## Source maps

**Source maps must never be deployed.** rsbuild builds with `hidden-source-map`,
which omits the `//# sourceMappingURL` comment but _still writes the `.map`
files_. Since `wrangler.toml` deploys the whole `build/` directory, those maps
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

**Profile, not an ad-hoc `export`.** v3.114.1 shipped once with no maps because
the three vars had only ever been exported into a single terminal, and that
shell was gone by deploy time. `npm run go` warns in yellow and deploys anyway —
correct (a missing token must never publish source, and must never block a
deploy) but easy to lose in 60 lines of build output. If you deploy from a fresh
shell, check the warning.

### Verifying a release actually shipped correctly

Three checks, none of which can be inferred from the deploy output. Each one
below has a trap that makes the naive version report the wrong answer.

**1. Did the maps reach Sentry?**

```bash
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/projects/$SENTRY_ORG/$SENTRY_PROJECT/files/artifact-bundles/"
```

Look for a bundle whose `associations` contain `tally-reading@<version>`. The
path is `files/artifact-bundles/` — bare `artifact-bundles/` **404s**. And
`releases/<version>/files/` legitimately returns **0 files**: debug-ID uploads
are not release-scoped, so an empty list there is not evidence of failure.

**2. Do the deployed bundles carry debug IDs?** Debug IDs are what pair the
uploaded maps to incoming stack frames, so a successful upload is worthless if
the deployed JS wasn't injected.

```bash
curl -sL https://tallyreading.uk/static/js/index.<hash>.js | grep -c _sentryDebugIds
```

Expect a non-zero count. Injection is recursive, so spot-check an `async/` chunk
too. Note that a redeploy may upload only **one** changed asset — Cloudflare's
asset store is keyed by content hash, so already-injected bundles are deduped.
A small upload count does **not** mean injection was partial.

**3. Are the maps absent from the public site?**

```bash
curl -sL -D- -o /tmp/probe https://tallyreading.uk/static/js/index.<hash>.js.map
```

**A 200 here proves nothing.** Cloudflare's SPA fallback answers _any_ unmatched
path with `index.html` and a 200 — `definitely-not-real.js.map` returns 200 too.
Check `content-type: text/html` and grep the body for `"sources"`/`"mappings"`;
absent means the strip worked. Checking only the status code reports a leak that
isn't there, and would report a real leak identically.

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
  because the dev _deploy_ is also a production-mode build.
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

## Cron monitoring — one Sentry monitor, plus a watchdog

**Sentry's free/dev plan includes exactly ONE cron monitor**, and the next tier
is £89/mo. That isn't proportionate for this product, so coverage is split:

| Concern                            | Mechanism                                               |
| ---------------------------------- | ------------------------------------------------------- |
| Are crons running at all?          | The one Sentry monitor, on `demo-environment-reset`     |
| Did a specific nightly job finish? | `src/utils/cronWatchdog.js` + the `cron_runs` table     |
| Did a job fail?                    | Every cron rethrows; the handler captures the exception |

The single slot is spent on `demo-environment-reset` because it runs **hourly** —
if Cloudflare's scheduler dies you know within ~15 minutes. Spending it on a
nightly job would buy one signal a day.

`streaks-and-gdpr-cleanup`, `badge-evaluation` and `wonde-school-sync` have **no**
`withMonitor`. Attempting it wastes nothing but noise: the upsert is rejected
over quota, the monitor sits permanently "waiting for first check-in", and every
nightly run adds a "Monitor not found" ingestion error.

Instead each stamps `cron_runs` on success via `recordCronSuccess()`, and
`checkCronFreshness()` runs at the top of the hourly cron, capturing a Sentry
exception for anything older than 26 hours. The two halves cover each other: a
watchdog can't report its own death (the hourly monitor catches that), and the
monitor can't tell you the 3am sync stopped (the watchdog catches that).

Thresholds are 26h rather than 24h because Cloudflare cron triggers drift — see
below. `*/1 * * * *` (metadata enrichment) is monitored by neither: it fires
1,440×/day, its normal state is "no job to do", and it's the job the watchdog
runs alongside. Its failures use `Sentry.captureException` directly.

**To make any of this reach you**, two issue alert rules do the notifying. Both
are scoped to `production` and email issue owners, falling through to active
members:

| Rule                                                                                       | Fires when                         | Filter                                               | Rate limit |
| ------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------- | ---------- |
| [Worker errors (Cloudflare)](https://scratch-it.sentry.io/monitors/alerts/727264/)         | New issue, or resolved → regressed | `sdk.name` **equals** `sentry.javascript.cloudflare` | 1h         |
| [Cron watchdog: nightly job overdue](https://scratch-it.sentry.io/monitors/alerts/727344/) | Issue seen > 3 times in 1d         | tag `watchdog` **is set**                            | 12h        |

The first exists because both halves of the app share one project, and `sdk.name`
is the only thing separating them — the frontend reports `environment:
production` too, so an environment filter alone would page you for every browser
typo.

The second exists because the first only fires on _new_ issues. A cron that
stays dead goes quiet after day one, which is precisely the failure the watchdog
was built to catch. Its `watchdog is set` filter deliberately has no value, so
it covers `stale`, `missing` **and** `self-failure` — the watchdog breaking
reports itself.

**The `> 3 times in 1d` threshold is load-bearing.** `checkCronFreshness()` runs
inside the hourly cron, so a stale job emits exactly **one event per hour** — any
"more than N per hour" condition can never fire, however dead the job is. Three
per day trips ~4h after a job goes missing and re-arms every 12h until it's
fixed. If you change the watchdog's cadence, change this with it.

Use the **event attribute** filter for `sdk.name` and the **tagged event** filter
for `watchdog`. `sdk.name` is an event attribute, not a tag; a tag filter accepts
the value happily and then matches nothing — the same silent-drop failure as the
schedule shape above.

### Creating alert rules needs a _user_ token

`SENTRY_AUTH_TOKEN` (the `sntrys_` org token used for source maps) carries a
fixed `org:ci` scope and cannot create alerts — the rules endpoint 403s. There
is no scope picker on the organization token page. Alert writes need a **user**
auth token (`sntryu_`, from Settings → Account → API → Auth Tokens) with
`alerts:write` + `project:read`. Check what you have with `sentry-cli info`
before assuming a 403 means the wrong org.

Note every rule has two IDs: `POST /projects/…/rules/` returns a legacy ID, while
the Automations UI and API read paths use a different workflow-engine ID
(744136 → 727264 for Worker errors; 744209 → 727344 for the watchdog). Looking up
the ID you just created will 404 — list the rules and match on name or
`dateCreated` instead.

### Why not just read each job's own output?

There was no reliable completion marker for the 2am streaks+GDPR job. It updates
streak fields and audit rows, but in a quiet period nothing changes, so
`students.updated_at` can't distinguish "ran, nothing to do" from "never ran". A
dedicated table records success explicitly, is uniform across jobs, and doesn't
couple the watchdog to any job's internals.

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
