import * as Sentry from '@sentry/react';
import { scrubSentryEvent } from './utils/sentryFilter.js';

/**
 * Which deployment this browser is talking to.
 *
 * Derived from the hostname at runtime rather than NODE_ENV, because the dev
 * *deploy* (`build:deploy:dev`) is also a production-mode build — NODE_ENV
 * can't tell the two apart. Without this every environment shared one
 * undifferentiated issue stream, so a localhost typo looked identical to a
 * school outage.
 */
function detectEnvironment() {
  if (typeof window === 'undefined') return 'unknown';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
    return 'development';
  }
  if (host === 'tallyreading.uk' || host === 'www.tallyreading.uk') return 'production';
  return 'preview';
}

const environment = detectEnvironment();

Sentry.init({
  dsn: 'https://25b3acc2fef842c15c0498a337f57d15@o4511076878057472.ingest.de.sentry.io/4511076934942800',
  environment,
  // Version injected at build time by rsbuild (source.define) from package.json,
  // so Sentry tags each error with the real release. Falls back to 'dev' when
  // the define isn't applied (e.g. tests). `process` is compile-time-replaced,
  // not a runtime browser global — hence the no-undef suppression.
  // eslint-disable-next-line no-undef
  release: `tally-reading@${process.env.APP_VERSION || 'dev'}`,

  integrations: [
    Sentry.browserTracingIntegration(),
    // 'log' is deliberately excluded: console.log is used freely as dev noise
    // throughout the app, and shipping every line burns Sentry log quota for
    // no diagnostic gain. Warnings and errors are the signal.
    Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] }),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Tracing — 2% is enough signal for latency regressions without paying
  // for every transaction. Dial up temporarily when investigating.
  tracesSampleRate: 0.02,
  tracePropagationTargets: ['localhost', /^https:\/\/tallyreading\.uk/],

  // Session Replay — 1% of normal sessions, 10% of sessions that hit an
  // error. We're a children's-data product: reducing the error-replay rate
  // (down from 100%) cuts how much child-facing UI ships to a third party.
  // Combined with `scrubSentryEvent` below it gives meaningful regression
  // signal without indiscriminate replay capture. Replays at 10% were
  // ~2-5MB each; iPads on tent wifi struggle.
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 0.1,

  // Strip likely-PII from extras / breadcrumb data / request bodies before
  // events leave the browser. Particularly important on a children's-data
  // product: errorInfo / componentStack / fetch payloads can contain
  // student names, DOB, demographics if a render fails mid-page.
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryEvent,

  // Logs
  enableLogs: true,
});
