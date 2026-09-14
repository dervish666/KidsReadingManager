import './instrument'; // Sentry must initialize before any other imports

import React from 'react';
import ReactDOM from 'react-dom/client';
import { reactErrorHandler } from '@sentry/react';
import App from './App';
import { recoverFromChunkError } from './utils/chunkRecovery';

// Not every lazy import is inside a React boundary. `statsExport` pulls in
// jspdf and `BarcodeScanner` pulls in html5-qrcode from click handlers, so a
// chunk that a deploy has replaced surfaces there as an unhandled rejection
// that ErrorBoundary never sees. Same stale-tab cause, same one reload.
window.addEventListener('unhandledrejection', (event) => {
  if (recoverFromChunkError(event.reason)) event.preventDefault();
});

const root = ReactDOM.createRoot(document.getElementById('root'), {
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler(),
});
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
