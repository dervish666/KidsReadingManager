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

  // Tracing
  tracesSampleRate: 0.1,
  tracePropagationTargets: ['localhost', /^https:\/\/tallyreading\.uk/],

  // Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Logs
  enableLogs: true,
});
