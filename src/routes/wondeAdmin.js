import { Hono } from 'hono';
import { decryptSensitiveData, encryptSensitiveData, getEncryptionSecret } from '../utils/crypto.js';
import { runFullSync } from '../services/wondeSync.js';
import { fetchSchoolDetails } from '../utils/wondeApi.js';
import { requireAdmin, requireOwner } from '../middleware/tenant.js';

const wondeAdminRouter = new Hono();

// POST /sync — Trigger manual Wonde sync (admin only)
wondeAdminRouter.post('/sync', requireAdmin(), async (c) => {
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
  if (!c.env.JWT_SECRET) {
    return c.json({ error: 'Server encryption not configured' }, 500);
  }
  let schoolToken;
  try {
    schoolToken = await decryptSensitiveData(org.wonde_school_token, getEncryptionSecret(c.env));
  } catch (err) {
    return c.json({ error: 'Failed to decrypt school token. Token may need to be re-set.' }, 500);
  }

  // Run full sync
  const result = await runFullSync(orgId, schoolToken, org.wonde_school_id, db);

  return c.json({
    success: result.status === 'completed',
    ...result,
  });
});

// POST /sync/:orgId — Trigger Wonde sync for a specific org (owner only)
// Also fetches and updates school contact details from Wonde.
wondeAdminRouter.post('/sync/:orgId', requireOwner(), async (c) => {
  const orgId = c.req.param('orgId');
  const db = c.env.READING_MANAGER_DB;

  const org = await db.prepare(
    'SELECT wonde_school_id, wonde_school_token FROM organizations WHERE id = ? AND is_active = 1'
  ).bind(orgId).first();

  if (!org || !org.wonde_school_id) {
    return c.json({ error: 'Organization not connected to Wonde' }, 400);
  }

  if (!org.wonde_school_token) {
    return c.json({ error: 'No Wonde school token configured' }, 400);
  }

  if (!c.env.JWT_SECRET) {
    return c.json({ error: 'Server encryption not configured' }, 500);
  }

  let schoolToken;
  try {
    schoolToken = await decryptSensitiveData(org.wonde_school_token, getEncryptionSecret(c.env));
  } catch {
    return c.json({ error: 'Failed to decrypt school token' }, 500);
  }

  // Fetch and update school contact details
  try {
    const details = await fetchSchoolDetails(schoolToken, org.wonde_school_id);
    if (details) {
      await db.prepare(
        `UPDATE organizations SET
          contact_email = COALESCE(?, contact_email),
          phone = COALESCE(?, phone),
          address_line_1 = COALESCE(?, address_line_1),
          address_line_2 = COALESCE(?, address_line_2),
          town = COALESCE(?, town),
          postcode = COALESCE(?, postcode),
          updated_at = datetime('now')
        WHERE id = ?`
      ).bind(
        (details.email || '').trim() || null,
        (details.phone_number || '').trim() || null,
        (details.address?.address_line_1 || '').trim() || null,
        (details.address?.address_line_2 || '').trim() || null,
        (details.address?.address_town || '').trim() || null,
        (details.address?.address_postcode || '').trim() || null,
        orgId
      ).run();
    }
  } catch (err) {
    console.warn(`[WondeAdmin] Could not fetch school details for ${orgId}:`, err.message);
  }

  // Run full data sync (students, classes, employees)
  const result = await runFullSync(orgId, schoolToken, org.wonde_school_id, db);

  return c.json({
    success: result.status === 'completed',
    ...result,
  });
});

// POST /token — Set the Wonde school token for the current org (owner only)
wondeAdminRouter.post('/token', requireOwner(), async (c) => {
  const db = c.env.READING_MANAGER_DB;

  const body = await c.req.json();
  const { schoolToken, organizationId } = body;

  if (!schoolToken || typeof schoolToken !== 'string' || schoolToken.trim().length === 0) {
    return c.json({ error: 'schoolToken is required' }, 400);
  }

  // Owner can target any org; otherwise use the caller's org
  const orgId = organizationId || c.get('organizationId');

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
  if (!c.env.JWT_SECRET) {
    return c.json({ error: 'Server encryption not configured' }, 500);
  }
  const encryptedToken = await encryptSensitiveData(schoolToken.trim(), getEncryptionSecret(c.env));
  await db.prepare(
    'UPDATE organizations SET wonde_school_token = ?, updated_at = datetime("now") WHERE id = ?'
  ).bind(encryptedToken, orgId).run();

  return c.json({ success: true, message: `Token set for ${org.name}` });
});

// GET /status — Get latest sync status (admin only)
wondeAdminRouter.get('/status', requireAdmin(), async (c) => {
  const orgId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  const latestSync = await db.prepare(
    'SELECT * FROM wonde_sync_log WHERE organization_id = ? ORDER BY started_at DESC LIMIT 1'
  ).bind(orgId).first();

  const org = await db.prepare(
    'SELECT wonde_school_id, wonde_last_sync_at FROM organizations WHERE id = ? AND is_active = 1'
  ).bind(orgId).first();

  return c.json({
    connected: Boolean(org?.wonde_school_id),
    lastSyncAt: org?.wonde_last_sync_at || null,
    latestSync: latestSync || null,
  });
});

export default wondeAdminRouter;
