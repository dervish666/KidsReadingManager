import './instrument'; // Sentry must initialize before any other imports

import React from 'react';
import ReactDOM from 'react-dom/client';
import { reactErrorHandler } from '@sentry/react';
import App from './App';

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
