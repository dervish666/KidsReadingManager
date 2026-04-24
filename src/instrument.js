import * as Sentry from '@sentry/react';

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

  // Session Replay — 1% of normal sessions, 100% of sessions that hit an
  // error. Replays at 10% were ~2-5MB each; iPads on tent wifi struggle.
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  // Logs
  enableLogs: true,
});
