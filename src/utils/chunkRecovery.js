/**
 * Recovery for failed lazy-chunk loads.
 *
 * Every route in App.js is a `React.lazy(() => import(...))`, so navigating
 * fetches a content-hashed JS chunk and, for the landing page, a CSS one.
 * Those filenames change on every deploy and the old ones stop being served
 * the moment a new version goes out. A tab that was opened before a deploy is
 * therefore holding a bundle that points at files which no longer exist, and
 * the first lazy navigation after that throws:
 *
 *   ChunkLoadError: Loading chunk 12 failed.
 *   Error: Loading CSS chunk 12 failed.
 *
 * The page is not broken in any interesting way. It is one release behind,
 * and index.html is served `no-cache`, so a single reload picks up the current
 * bundle and everything works. That is what this does.
 *
 * Two things it deliberately does NOT do:
 *
 *   - Reload in a loop. sessionStorage records when we last tried, and a
 *     second attempt inside RELOAD_COOLDOWN_MS is refused, so if the fresh
 *     bundle fails the same way the failure goes to the error UI and to
 *     Sentry, where it belongs. An unguarded reload-on-error turns a genuine
 *     bad deploy into an infinite refresh loop pointed at production. The
 *     guard is a cooldown rather than a permanent flag because the next
 *     deploy, days later, deserves its own retry and would otherwise be
 *     refused because of a reload the user has long forgotten.
 *   - Reload for crawlers. Bingbot aborting a stylesheet is what prompted this
 *     file (TALLY-READING-J, 13 Sep 2026); telling a crawler to re-fetch the
 *     page it just abandoned helps nobody.
 */

import { isCrawlerUserAgent } from './sentryFilter.js';

const RELOAD_FLAG = 'tally:chunk-reloaded-at';

/**
 * How long a reload attempt suppresses the next one. A refresh loop repeats in
 * under a second; a real second chunk failure arrives a deploy later, so any
 * value comfortably above page-load time and comfortably below "next release"
 * separates the two. Thirty seconds is both.
 */
const RELOAD_COOLDOWN_MS = 30_000;

/**
 * Does this error mean "a chunk we asked for is no longer on the server"?
 *
 * rspack's JS loader sets `name = 'ChunkLoadError'`; its CSS loader sets
 * `code = 'CSS_CHUNK_LOAD_FAILED'` and leaves the name as plain `Error`, which
 * is why matching on name alone misses exactly the case we saw in production.
 */
export function isChunkLoadError(error) {
  if (!error) return false;
  if (error.code === 'CSS_CHUNK_LOAD_FAILED') return true;
  if (error.name === 'ChunkLoadError') return true;
  const message = typeof error.message === 'string' ? error.message : '';
  return /Loading (?:CSS )?chunk [^\s]+ failed/i.test(message);
}

/**
 * Reload once to pick up the current bundle.
 *
 * Returns true if a reload was triggered, in which case the caller should stop
 * what it was doing, because there is no point reporting an error we are
 * about to navigate away from. Returns false if this is not a chunk error,
 * if we already tried, or if there is no point trying (crawler, no window).
 *
 * Dependencies are injected so this is testable without a real browser.
 */
export function recoverFromChunkError(error, options = {}) {
  if (!isChunkLoadError(error)) return false;
  if (typeof window === 'undefined') return false;

  const {
    storage = safeSessionStorage(),
    userAgent = window.navigator?.userAgent,
    reload = () => window.location.reload(),
  } = options;

  if (isCrawlerUserAgent(userAgent)) return false;

  // Private browsing and blocked site-data both throw here rather than
  // returning null. Without a place to record the attempt we cannot promise
  // we will not loop, so we decline to reload at all.
  if (!storage) return false;
  const now = options.now ?? Date.now();
  try {
    const last = Number(storage.getItem(RELOAD_FLAG));
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_COOLDOWN_MS) {
      return false;
    }
    storage.setItem(RELOAD_FLAG, String(now));
  } catch {
    return false;
  }

  reload();
  return true;
}

function safeSessionStorage() {
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}
