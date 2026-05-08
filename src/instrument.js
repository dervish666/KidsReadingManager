import * as Sentry from '@sentry/react';
import { scrubSentryEvent } from './utils/sentryFilter.js';

Sentry.init({
  dsn: 'https://25b3acc2fef842c15c0498a337f57d15@o4511076878057472.ingest.de.sentry.io/4511076934942800',
  release: 'tally-reading@3.24.0',

  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
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
