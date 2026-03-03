import { Hono } from 'hono';
import { decryptSensitiveData, encryptSensitiveData } from '../utils/crypto.js';
import { runFullSync } from '../services/wondeSync.js';

const wondeAdminRouter = new Hono();

// POST /sync — Trigger manual Wonde sync (admin only)
wondeAdminRouter.post('/sync', async (c) => {
  // Check admin role
  const userRole = c.get('userRole');
  if (userRole !== 'admin' && userRole !== 'owner') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const orgId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  // Get org Wonde details
  const org = await db.prepare(
    'SELECT wonde_school_id, wonde_school_token FROM organizations WHERE id = ? AND is_active = 1'
  ).bind(orgId).first();

  if (!org || !org.wonde_school_id) {
    return c.json({ error: 'This organization is not connected to Wonde' }, 400);
  }

  if (!org.wonde_school_token) {
    return c.json({ error: 'No Wonde school token configured. Set it via POST /api/wonde/token first.' }, 400);
  }

  // Decrypt school token
  const schoolToken = await decryptSensitiveData(org.wonde_school_token, c.env.JWT_SECRET);

  // Run full sync
  const result = await runFullSync(orgId, schoolToken, org.wonde_school_id, db);

  return c.json({
    success: result.status === 'completed',
    ...result,
  });
});

// POST /token — Set the Wonde school token for the current org (owner only)
wondeAdminRouter.post('/token', async (c) => {
  const userRole = c.get('userRole');
  if (userRole !== 'owner') {
    return c.json({ error: 'Owner access required' }, 403);
  }

  const orgId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  const body = await c.req.json();
  const { schoolToken } = body;

  if (!schoolToken || typeof schoolToken !== 'string' || schoolToken.trim().length === 0) {
    return c.json({ error: 'schoolToken is required' }, 400);
  }

  // Verify the org exists and has a wonde_school_id
  const org = await db.prepare(
    'SELECT id, wonde_school_id, name FROM organizations WHERE id = ? AND is_active = 1'
  ).bind(orgId).first();

  if (!org) {
    return c.json({ error: 'Organization not found' }, 404);
  }

  if (!org.wonde_school_id) {
    return c.json({ error: 'Organization has no wonde_school_id — cannot set token' }, 400);
  }

  // Encrypt and store
  const encryptedToken = await encryptSensitiveData(schoolToken.trim(), c.env.JWT_SECRET);
  await db.prepare(
    'UPDATE organizations SET wonde_school_token = ?, updated_at = datetime("now") WHERE id = ?'
  ).bind(encryptedToken, orgId).run();

  return c.json({ success: true, message: `Token set for ${org.name}` });
});

// GET /status — Get latest sync status (admin only)
wondeAdminRouter.get('/status', async (c) => {
  const userRole = c.get('userRole');
  if (userRole !== 'admin' && userRole !== 'owner') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const orgId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  const latestSync = await db.prepare(
    'SELECT * FROM wonde_sync_log WHERE organization_id = ? ORDER BY started_at DESC LIMIT 1'
  ).bind(orgId).first();

  const org = await db.prepare(
    'SELECT wonde_school_id, wonde_last_sync_at FROM organizations WHERE id = ?'
  ).bind(orgId).first();

  return c.json({
    connected: Boolean(org?.wonde_school_id),
    lastSyncAt: org?.wonde_last_sync_at || null,
    latestSync: latestSync || null,
  });
});

export default wondeAdminRouter;
