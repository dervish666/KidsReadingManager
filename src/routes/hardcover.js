import { Hono } from 'hono';
import { requireTeacher } from '../middleware/tenant';

const hardcoverRouter = new Hono();

const HARDCOVER_GRAPHQL_URL = 'https://api.hardcover.app/v1/graphql';

/**
 * POST /api/hardcover/graphql
 * Proxies GraphQL requests to the Hardcover API server-side,
 * avoiding browser CORS restrictions.
 * Reads the API key from organization settings.
 */
hardcoverRouter.post('/graphql', requireTeacher(), async (c) => {
  const db = c.env.READING_MANAGER_DB;
  const organizationId = c.get('organizationId');

  // Read Hardcover API key from org settings
  let apiKey = null;
  if (db && organizationId) {
    const row = await db.prepare(
      `SELECT setting_value FROM org_settings WHERE organization_id = ? AND setting_key = 'bookMetadata'`
    ).bind(organizationId).first();

    if (row) {
      try {
        const bookMetadata = JSON.parse(row.setting_value);
        apiKey = bookMetadata.hardcoverApiKey || null;
      } catch {
        // ignore parse errors
      }
    }
  }

  // Allow the request body to supply an API key override (for availability checks
  // before the key is saved to settings)
  const body = await c.req.json();
  const effectiveApiKey = body.apiKey || apiKey;

  if (!effectiveApiKey) {
    return c.json({ error: 'Hardcover API key is not configured' }, 400);
  }

  const { query, variables } = body;
  if (!query) {
    return c.json({ error: 'GraphQL query is required' }, 400);
  }

  const response = await fetch(HARDCOVER_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: effectiveApiKey
    },
    body: JSON.stringify({ query, variables })
  });

  const data = await response.json();
  return c.json(data, response.status);
});

export { hardcoverRouter };
