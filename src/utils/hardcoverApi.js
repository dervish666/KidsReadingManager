/**
 * Hardcover API Integration
 * Provides functions to query the Hardcover GraphQL API
 * for book metadata, including series information.
 */

const HARDCOVER_GRAPHQL_URL = 'https://api.hardcover.app/v1/graphql';

// Cache for Hardcover availability status
let hardcoverAvailable = null;
let lastAvailabilityCheck = 0;
const AVAILABILITY_CHECK_INTERVAL = 60000; // Re-check every 60 seconds

/**
 * Internal helper to POST a GraphQL query to the Hardcover API.
 * @param {string} query - GraphQL query string
 * @param {Object} variables - GraphQL variables
 * @param {string} apiKey - Hardcover API key
 * @param {Object} [options] - Additional fetch options (e.g. signal)
 * @returns {Promise<Object>} The `data` field from the GraphQL response
 * @throws {Error} On HTTP errors or GraphQL errors
 */
async function hardcoverQuery(query, variables, apiKey, options = {}) {
  const response = await fetch(HARDCOVER_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: apiKey
    },
    body: JSON.stringify({ query, variables }),
    ...options
  });

  if (!response.ok) {
    throw new Error(`Hardcover API error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();

  if (json.errors && json.errors.length > 0) {
    throw new Error(`Hardcover GraphQL error: ${json.errors[0].message}`);
  }

  return json.data;
}

/**
 * Check if the Hardcover API is available with a quick timeout.
 * Sends a lightweight introspection query and caches the result for 60 seconds.
 * @param {string} apiKey - Hardcover API key
 * @param {number} timeout - Timeout in milliseconds (default: 3000ms)
 * @returns {Promise<boolean>} True if Hardcover API is reachable and authenticated
 */
export async function checkHardcoverAvailability(apiKey, timeout = 3000) {
  const now = Date.now();

  // Return cached result if recent
  if (hardcoverAvailable !== null && (now - lastAvailabilityCheck) < AVAILABILITY_CHECK_INTERVAL) {
    return hardcoverAvailable;
  }

  if (!apiKey) {
    console.log('Hardcover API key not provided');
    return false;
  }

  let timeoutId;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), timeout);

    await hardcoverQuery(
      '{ __typename }',
      {},
      apiKey,
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    hardcoverAvailable = true;
    lastAvailabilityCheck = now;

    console.log('Hardcover API availability check: available');
    return true;
  } catch (error) {
    clearTimeout(timeoutId);
    console.log('Hardcover API availability check failed:', error.message);
    hardcoverAvailable = false;
    lastAvailabilityCheck = now;
    return false;
  }
}

/**
 * Reset the availability cache (useful for retry scenarios)
 */
export function resetHardcoverAvailabilityCache() {
  hardcoverAvailable = null;
  lastAvailabilityCheck = 0;
}

/**
 * Get the current cached availability status without making a request
 * @returns {{available: boolean|null, lastCheck: number, stale: boolean}}
 */
export function getHardcoverStatus() {
  const now = Date.now();
  return {
    available: hardcoverAvailable,
    lastCheck: lastAvailabilityCheck,
    stale: (now - lastAvailabilityCheck) >= AVAILABILITY_CHECK_INTERVAL
  };
}
