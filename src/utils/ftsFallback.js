/**
 * One log line for every FTS5 → LIKE fallback.
 *
 * The `books_fts` virtual table backs book search. When a MATCH throws, every
 * call site catches it and falls back to a LIKE scan, which returns plausible
 * results — so search keeps "working" and nothing indicates the index is gone.
 * That is exactly how full-text search stayed broken across every school for
 * months: the fallback was doing its job, silently.
 *
 * `console.warn`, deliberately, not `Sentry.captureException`: the Worker's
 * `consoleLoggingIntegration` ships warn/error to Sentry *Logs*, so the
 * evidence is searchable without opening an Issue for what is often a single
 * malformed query. The pattern this repo already uses — transient noise is a
 * log, sustained failure is an alert — applies here: one of these is a user
 * typing a stray quote, thousands is a broken index.
 *
 * Alert on the rate of `[FTS5] fallback` in Sentry Logs, not on any single one.
 *
 * NOTE: deliberately not called from the per-title retry loops in
 * routes/books/import.js. Those fall back once per *book* on a large import,
 * where a malformed title is expected and the volume would bury a real signal.
 * The chunk-level failures there do call it.
 *
 * @param {string} site - where it happened, e.g. 'books/core:search'
 * @param {unknown} error - the caught error
 */
export function warnFtsFallback(site, error) {
  const message = error instanceof Error ? error.message : String(error ?? 'unknown');
  console.warn(`[FTS5] fallback to LIKE at ${site}: ${message}`);
}
