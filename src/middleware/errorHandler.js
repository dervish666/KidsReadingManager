/**
 * Error handling for Hono.
 *
 * IMPORTANT (Hono ≥4): an error thrown in a ROUTE HANDLER does not reject
 * middleware's `next()` — Hono routes it straight to `app.onError`. The
 * `errorHandler()` middleware below therefore only sees errors thrown by
 * downstream MIDDLEWARE; `onError` is the piece that turns thrown
 * badRequestError/notFoundError/... into proper JSON responses. Both are
 * registered in worker.js and produce the same response shape.
 */

import { isTransientD1Error } from '../utils/d1Retry.js';

/** app.onError handler — install with `app.onError(onError)`. */
export const onError = (err, c) => {
  // A transient D1 failure on a request path is Cloudflare's, not ours, but it
  // still cost a user a save. Tag it so Sentry can count them separately from
  // real bugs; before this it was indistinguishable from any other 500.
  const tag = isTransientD1Error(err) ? '[D1Transient] ' : '';
  console.error(`${tag}Error in request to ${c.req.path}:`, err.message);
  const status = err.status || 500;
  // For 5xx errors, don't leak internal details to client
  const message = status >= 500 ? 'Internal Server Error' : err.message || 'An error occurred';

  return c.json(
    {
      status: 'error',
      error: message,
      message,
      path: c.req.path,
    },
    status
  );
};

export const errorHandler = () => {
  return async (c, next) => {
    try {
      await next();
    } catch (error) {
      console.error(`Error in request to ${c.req.path}:`, error);

      // Determine status code
      const status = error.status || 500;

      // For 5xx errors, don't leak internal details to client
      const message =
        status >= 500 ? 'Internal Server Error' : error.message || 'An error occurred';

      return c.json(
        {
          status: 'error',
          error: message,
          message,
          path: c.req.path,
        },
        status
      );
    }
  };
};

/**
 * Create a custom error with status code
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @returns {Error} - Error object with status
 */
export function createError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Not found error
 * @param {string} message - Error message
 * @returns {Error} - Error with 404 status
 */
export function notFoundError(message = 'Resource not found') {
  return createError(message, 404);
}

/**
 * Bad request error
 * @param {string} message - Error message
 * @returns {Error} - Error with 400 status
 */
export function badRequestError(message = 'Bad request') {
  return createError(message, 400);
}

/**
 * Forbidden error
 * @param {string} message - Error message
 * @returns {Error} - Error with 403 status
 */
export function forbiddenError(message = 'Permission denied') {
  return createError(message, 403);
}

/**
 * Server error
 * @param {string} message - Error message
 * @returns {Error} - Error with 500 status
 */
export function serverError(message = 'Internal server error') {
  return createError(message, 500);
}
