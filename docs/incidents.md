# Incident history

Long-form background for the rules in [CLAUDE.md](../CLAUDE.md#gotchas).

Each entry is the verbatim note written when the problem was found: what broke,
how it was diagnosed, and why the current code looks the way it does. The rule
itself lives in CLAUDE.md — this file is the evidence behind it, kept separate
so the operative document stays short enough to read.

Nothing here is obsolete. If an entry stops being true, fix it in both places.


## Never deploy source maps

<a id="never-deploy-source-maps"></a>

**Never deploy source maps**: `hidden-source-map` only drops the `sourceMappingURL` comment — the `.map` files are still written and `[assets] directory = "./build"` ships everything in that folder. Deploy only via `npm run go` or `scripts/build-and-deploy.sh`; both run `scripts/sentry-release.sh`, which strips them. A bare `npm run build && wrangler deploy` would publish your full unminified source.


## A Sentry cron monitor only goes red if the callback throws

<a id="sentry-monitor-swallowed-errors"></a>

**A Sentry cron monitor only goes red if the callback throws**: `Sentry.withMonitor` reports success when the handler swallows its own error. If you wrap a cron handler that `catch`es and logs, rethrow — otherwise the monitor can never fail. See `docs/sentry.md`.


## Only one Sentry cron monitor is available

<a id="one-sentry-cron-monitor"></a>

**Only one Sentry cron monitor is available** (free/dev plan; next tier £89/mo). It's spent on `demo-environment-reset` because it runs hourly. The three nightly crons use the `cron_runs` table + `src/utils/cronWatchdog.js` instead — `recordCronSuccess()` on completion, `checkCronFreshness()` hourly, Sentry exception if anything exceeds 26h. Don't add `withMonitor` to them: the upsert is rejected over quota and every run logs a "Monitor not found" ingestion error. See `docs/sentry.md`.


## Sentry monitor schedules are { type: 'crontab', value: '0 3 * * *' }

<a id="sentry-monitor-schedule-shape"></a>

**Sentry monitor schedules are `{ type: 'crontab', value: '0 3 * * *' }`**: the shorthand `{ crontab: '0 3 * * *' }` is silently rejected at ingest — no monitor is created, every check-in is dropped, and `withMonitor` reports no error. Every monitor was dead this way until v3.114.1. After adding a monitor, confirm it appears on Sentry's Crons page; a passing cron proves nothing about the monitor.


## A D1 error from a cron is usually Cloudflare's, not yours

<a id="transient-d1-errors"></a>

**A D1 error from a cron is usually Cloudflare's, not yours**: `D1_ERROR: internal error; reference = <id>`, `Network connection lost` and `DB is overloaded. Requests queued for too long.` are platform-side. The `reference` is Cloudflare's own incident handle — quote it to support. This database is ~18.5 MB with 875 reading sessions; queries here do not overload a D1 primary. The every-minute cron used to `captureException` on a probe that reads 6 rows in 0.16 ms, which turned a 58-minute Cloudflare wobble on 2026-07-16 into 58 consecutive alert emails. **Never `captureException` a transient D1 failure from a high-frequency cron** — log it (`console.warn` reaches Sentry Logs via `consoleLoggingIntegration`) and let `src/utils/cronWatchdog.js` report the *absence* of successful runs instead. Transient noise is a log; sustained absence is an alert.


## Cron staleness alerts are edge-triggered, not hourly

<a id="cron-staleness-edge-trigger"></a>

**2026-08-21.** At 02:31:24 UTC a Cloudflare D1 call threw `D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset` on the badge cron's *first* statement — the `SELECT id, last_badge_cursor, last_badge_watermark FROM organizations` at the top of the `30 2 * * *` branch. The query hung for roughly 33 seconds before throwing; the whole job normally finishes in 7-15. It died before touching a single organisation, so no watermark moved and no cursor was set.

Everything downstream then worked exactly as designed, which is the problem. The branch rethrows, so `recordCronSuccess` never ran; `cron_runs` kept the previous night's stamp; the 26-hour threshold tripped at 04:30; and `checkCronFreshness` — which runs inside the hourly `7 * * * *` cron — captured a Sentry exception on **every pass** until the next successful run. One missed job produced **22 events and 3 emails**, titled `27h`, `28h`, … `48h`. Each looked like a fresh, worsening incident. The job repaired itself at 02:30 the following night, because badge inserts are `INSERT OR IGNORE` behind a unique index and the watermark had never advanced. Nothing was lost. No school had logged a reading session since 16 July.

Two things were wrong, and neither was the code that failed.

**The alerting was level-triggered.** A watchdog that re-reports the same outage every hour is telling you the clock is running, not that anything new happened. `cron_runs.stale_alerted_at` (migration 0076) now records the outage we have already alerted about; `recordCronSuccess` clears it, so recovery re-arms the alert. While a job stays stale it re-alerts once every `STALE_REALERT_HOURS` (24) — deliberately not zero, because an alert that fires once and then goes quiet is indistinguishable from a problem someone fixed.

**The retry cost was inverted.** The only D1 retry ladder in the codebase lived in `batchExec` in `src/services/demoReset.js` — the job whose next attempt is 60 minutes away. The three nightly jobs, whose next attempt is 24 hours away, had none. That ladder is now `retryD1()` in `src/utils/d1Retry.js` and the nightly crons use it.

Be honest about what the retry buys, though: it would **not** have saved this particular run. The failure was a 33-second hang, and the badge job's own budget is 22 seconds, so a deadline-aware retry declines to start a second attempt. What it covers is the fast transient — `DB is overloaded. Requests queued for too long.`, six of which hit this project on 9-10 August and returned in about a second each. The noise fix is the edge-trigger; the retry is insurance against the cheaper failure.

A third thing, worth remembering separately: the *cause* (`TALLY-READING-A`) was archived in Sentry and therefore silent, while the *symptom* (`TALLY-READING-H`, cron staleness) mailed three times. Muting a noisy platform error is right; muting it forever means the next incident is diagnosed from its shadow. It now carries an occurrence threshold (3 in 24h) rather than a permanent archive.


## APP_VERSION comes from the bundled package.json, not a deploy-time --var

<a id="app-version-source"></a>

**`APP_VERSION` comes from the bundled `package.json`, not a deploy-time `--var`**: `src/worker.js` reads the `APP_VERSION` const imported from `package.json`. It used to be `env.APP_VERSION || 'dev'` fed by `wrangler deploy --var`, which silently degraded to `dev` whenever the Worker was published by anything other than `npm run deploy` — Cloudflare Workers Builds does a bare `version_upload` and carries no `--var`. Every production Sentry event was tagged `tally-reading@dev` while source maps uploaded under `tally-reading@<version>`, so **nothing symbolicated** and every trace showed bundled `worker.js:84640` frames. `/api/health` is not a check for this: it returns the bundled version and read correctly right through the broken deploys. Verify with `wrangler versions view <live-id>` or by searching Sentry for `release:tally-reading@3.x`.


## Class goals use resolveAcademicYear, never resolveCurrentTerm

<a id="class-goals-term-key"></a>

**Class goals use `resolveAcademicYear`, never `resolveCurrentTerm`**: every path that writes a `class_goals` row (`src/routes/classes.js`, and both session-triggered paths in `src/utils/classGoalsEngine.js`) stores an academic year like `2025/26`. The 2:30 AM drift-correction cron used `resolveCurrentTerm`, which returns a calendar quarter like `Q3 2026`, so its `WHERE term = ?` matched nothing and the job silently did nothing at all from 2026-04-12 to 2026-08-12 — the `genres` and `badges` metrics have no other reconciler. `resolveCurrentTerm` is still exported and still correct for display; it is just not the goal key. **Every statement touching `class_goals` must carry `AND term = ?`** — `PUT /api/classes/:id/goals` did not, so saving a target rewrote that metric's row in every term the class had ever had goals in, and the response counted each metric once per term (a class at Cheddar Grove Manual holds 6 rows under `2025/26` and 6 stale ones under `Q2 2026`, which read back as 12 goals with 5 achieved — the garden stage jumped from sprout to bloom on save and reverted on reload). Those stale rows are left in place deliberately: no code path reads or writes them now, and deleting production rows to tidy up is not worth the risk.


## MyLogin may never remove an elevated Tally role

<a id="mylogin-role-pin"></a>

**MyLogin may never remove an elevated Tally role**: `resolveRole` in `src/routes/mylogin.js` blocks elevation *and* pins `admin`/`owner`. MyLogin's type only maps to admin or teacher, and most staff are `employee` → teacher, so without the pin the first SSO login of a school whose Tally account was made by hand (self-signup makes the head an `owner`) silently demoted them to teacher — losing user management, class management and billing, with re-elevation undone at the next login. Demoting an admin is a decision for a Tally admin, in Tally. Users are matched by `mylogin_id`, then by email, then by `wonde_employee_id` (that last one exists because staff with no MIS address have no email to match on, and without it they got a *second* account on the `mylogin-<id>@no-email.invalid` placeholder — which then collided on `users.email UNIQUE` the day the MIS recorded their real address).


## Cloudflare Bot Fight Mode 403s every inbound webhook, and nothing in this repo can see it.

<a id="bot-fight-mode-webhooks"></a>

**Cloudflare Bot Fight Mode 403s every inbound webhook, and nothing in this repo can see it.** Wonde's delivery log showed `School Approved` deliveries on 2026-03-03 and 2026-06-10 (Cheddar Grove, `A929572862`), 3 attempts each, all **403** — a status this Worker cannot produce. It returns 401 for a bad secret and 503 for an unset one, and `/api/webhooks/wonde` is in `PUBLIC_PATHS` so tenant middleware never runs. The requests were blocked at the edge and never reached the Worker at all, so there is **no log line, no Sentry event, and no D1 row** — 45,651 Sentry log entries in 30 days and zero matching `Webhook`. **Not one organisation has ever been created by the webhook**; all three Wonde orgs were imported by hand via the owner UI, which is why nobody noticed. Diagnosis that worked: curl the endpoint yourself (401 = the Worker is reachable and the edge is fine, so the fault is inbound-source-specific), vary UA/payload/query shape to rule them out, then read the sender's own delivery log for the status *they* saw. **Anything that POSTs from a datacenter is exposed to this — Stripe webhooks included.** **A WAF skip rule does NOT rescue this — tested 2026-08-14 and it 403'd again.** The skip action only offers "All **Super** Bot Fight Mode Rules", and this zone runs plain **Bot Fight Mode** (free plan), which Cloudflare does not allow custom rules to bypass. A correctly-written rule (`http.request.uri.path wildcard r"/api/webhooks/*"` → Skip → SBFM rules) therefore matches nothing that matters and re-enabling still kills every webhook. **So Bot Fight Mode stays OFF on this zone**, and the rule is kept only because it starts working if the plan is ever upgraded to Pro. That trade is deliberate: Bot Fight Mode bought a free-plan scraper deterrent, and it cost four months of dead onboarding that nothing surfaced. The endpoints defend themselves anyway — Wonde by shared secret, Stripe by signature verification — and Cloudflare's baseline DDoS protection is unaffected by this setting.


## A shared secret in a query string is not the string you stored.

<a id="query-string-secret-plus"></a>

**A shared secret in a query string is not the string you stored.** `URLSearchParams` follows form-encoding rules and decodes `+` as a space, so a base64 secret (which contains `+` or `/` about half the time) arrives mangled and every delivery 401s while both ends *look* correct. `readQuerySecret()` in `src/routes/webhooks.js` parses the raw query and `decodeURIComponent`s it instead, which handles both a literal `+` and a properly percent-encoded one. The tests cover both. Same trap applies to any secret ever put in a URL.


## Prettier

<a id="prettier-pre-commit"></a>

**Prettier**: Configured via `.prettierrc` (single quotes, trailing commas, 100 char width). Auto-runs on edited files via Claude Code hook. Run `npx prettier --write "src/**/*.js"` to format the full codebase. A `.githooks/pre-commit` guard re-checks staged `src/**/*.js` — `npm install` points `core.hooksPath` at it via the `prepare` script, so it activates on checkout without any extra dependency. Bypass a single commit with `git commit --no-verify`. It exists because `main` sat red for a month (10 July – 2 Aug 2026) over eight files of whitespace; CI has since been restructured so that failure can't skip the test suite (see the CI table above), but catching it locally is still cheaper than a red build.


## Dependabot

<a id="dependabot-scope"></a>

**Dependabot**: `.github/dependabot.yml` runs weekly npm + monthly actions updates, grouping dev and production minor/patch bumps into one PR each; majors come through individually so their changelogs get read. Before this existed, alerts were on but nothing opened a PR, so they only got fixed when someone went looking. Read advisories for _applicability_ before acting — most alerts here land on dev-only transitives (miniflare, vite, eslint toolchains) that never reach the Worker.
