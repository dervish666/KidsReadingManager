/**
 * Error handler middleware for Hono
 * 
 * This middleware catches errors and formats them consistently.
 */

export const errorHandler = () => {
  return async (c, next) => {
    try {
      await next();
    } catch (error) {
      console.error(`Error in request to ${c.req.path}:`, error);
      
      // Determine status code
      const status = error.status || 500;
      
      // For 5xx errors, don't leak internal details to client
      const message = status >= 500
        ? 'Internal Server Error'
        : (error.message || 'An error occurred');

      return c.json({
        status: 'error',
        message,
        path: c.req.path
      }, status);
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
 * Server error
 * @param {string} message - Error message
 * @returns {Error} - Error with 500 status
 */
export function serverError(message = 'Internal server error') {
  return createError(message, 500);
}