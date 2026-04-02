import { Hono } from 'hono';
import { requireTeacher } from '../middleware/tenant';
import { decryptSensitiveData, getEncryptionSecret } from '../utils/crypto.js';

const hardcoverRouter = new Hono();

const HARDCOVER_GRAPHQL_URL = 'https://api.hardcover.app/v1/graphql';

/**
 * POST /api/hardcover/graphql
 * Proxies GraphQL requests to the Hardcover API server-side,
 * avoiding browser CORS restrictions.
 * Reads the API key from organization settings (encrypted at rest).
 */
hardcoverRouter.post('/graphql', requireTeacher(), async (c) => {
  const db = c.env.READING_MANAGER_DB;
  const organizationId = c.get('organizationId');

  // Read Hardcover API key from org settings and decrypt
  let apiKey = null;
  if (db && organizationId) {
    const row = await db.prepare(
      `SELECT setting_value FROM org_settings WHERE organization_id = ? AND setting_key = 'bookMetadata'`
    ).bind(organizationId).first();

    if (row) {
      try {
        const bookMetadata = JSON.parse(row.setting_value);
        const storedKey = bookMetadata.hardcoverApiKey || null;
        if (storedKey && c.env.JWT_SECRET) {
          try {
            apiKey = await decryptSensitiveData(storedKey, getEncryptionSecret(c.env));
          } catch {
            // Pre-migration plaintext value — use as-is
            apiKey = storedKey;
          }
        } else {
          apiKey = storedKey;
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  if (!apiKey) {
    return c.json({ error: 'Hardcover API key is not configured. Please configure it in Settings.' }, 400);
  }

  const body = await c.req.json();

  const { query, variables } = body;
  if (!query) {
    return c.json({ error: 'GraphQL query is required' }, 400);
  }

  // Only allow read-only queries — reject mutations and subscriptions.
  // Strip comments and whitespace first to prevent bypass via `# comment\nmutation { ... }`.
  const cleaned = query
    .replace(/#[^\n]*/g, '')   // strip single-line comments
    .replace(/^[\s\n]+/, '');  // strip leading whitespace
  if (/^(mutation|subscription)\b/i.test(cleaned)) {
    return c.json({ error: 'Only read-only GraphQL queries are allowed' }, 400);
  }

  let data;
  const response = await fetch(HARDCOVER_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: apiKey
    },
    body: JSON.stringify({ query, variables })
  });

  try {
    data = await response.json();
  } catch {
    return c.json({ error: 'Invalid response from Hardcover API' }, 502);
  }
  return c.json(data, response.status);
});

export { hardcoverRouter };
