import { Hono } from 'hono';
import { requireReadonly } from '../middleware/tenant';
import { badRequestError } from '../middleware/errorHandler';

const tours = new Hono();

// GET /status - returns all completed tours for the authenticated user
tours.get('/status', requireReadonly(), async (c) => {
  const userId = c.get('userId');
  const db = c.env.READING_MANAGER_DB;

  const { results } = await db
    .prepare('SELECT * FROM user_tour_completions WHERE user_id = ?')
    .bind(userId)
    .all();

  const completions = results.map((row) => ({
    tourId: row.tour_id,
    version: row.tour_version,
  }));
  return c.json(completions);
});

// POST /:tourId/complete - marks a tour as completed
tours.post('/:tourId/complete', requireReadonly(), async (c) => {
  const userId = c.get('userId');
  const tourId = c.req.param('tourId');

  if (!tourId || tourId.length > 50 || !/^[\w-]+$/.test(tourId)) {
    throw badRequestError('Invalid tour ID');
  }

  const db = c.env.READING_MANAGER_DB;

  let body;
  try {
    body = await c.req.json();
  } catch {
    throw badRequestError('Invalid JSON body');
  }

  const { version } = body;
  if (typeof version !== 'number' || version < 1) {
    throw badRequestError('version (number) is required');
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO user_tour_completions (user_id, tour_id, tour_version, completed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, tour_id)
       DO UPDATE SET tour_version = excluded.tour_version, completed_at = excluded.completed_at`
    )
    .bind(userId, tourId, version, now)
    .run();

  return c.json({ success: true, tourId, version });
});

// DELETE /:tourId/complete - resets a tour so it can be replayed
tours.delete('/:tourId/complete', requireReadonly(), async (c) => {
  const userId = c.get('userId');
  const tourId = c.req.param('tourId');
  const db = c.env.READING_MANAGER_DB;

  await db
    .prepare('DELETE FROM user_tour_completions WHERE user_id = ? AND tour_id = ?')
    .bind(userId, tourId)
    .run();

  return c.json({ success: true, tourId });
});

export { tours as toursRouter };
