/**
 * Wonde Webhook Handler
 *
 * Handles incoming webhooks from Wonde when schools interact with our
 * integration. Key events:
 *
 * - schoolApproved:  School has approved access via Wonde. Creates an
 *                    organization in D1, encrypts the school token, and
 *                    triggers a full data sync.
 * - accessRevoked:   School revoked access. Soft-deletes the org.
 * - accessDeclined:  School declined access. Soft-deletes the org.
 * - schoolMigration: School migrating servers. Logged for awareness.
 */

import { Hono } from 'hono';
import { encryptSensitiveData } from '../utils/crypto.js';
import { runFullSync } from '../services/wondeSync.js';

const webhooksRouter = new Hono();

webhooksRouter.post('/wonde', async (c) => {
  const body = await c.req.json();
  const db = c.env.READING_MANAGER_DB;

  if (!body.payload_type) {
    return c.json({ error: 'Missing payload_type' }, 400);
  }

  switch (body.payload_type) {
    case 'schoolApproved': {
      if (!body.school_id || !body.school_name || !body.school_token) {
        return c.json({ error: 'Missing required fields for schoolApproved' }, 400);
      }

      // Generate org ID and slug
      const orgId = crypto.randomUUID();
      const slug = body.school_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      // Encrypt school token
      const encryptedToken = await encryptSensitiveData(body.school_token, c.env.JWT_SECRET);

      // Create organization
      await db.prepare(
        `INSERT INTO organizations (id, name, slug, wonde_school_id, wonde_school_token, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, datetime("now"), datetime("now"))`
      ).bind(orgId, body.school_name, slug, body.school_id, encryptedToken).run();

      // Trigger full sync in background
      const syncPromise = runFullSync(orgId, body.school_token, body.school_id, db);
      try {
        // executionCtx is a read-only getter that throws when unavailable
        c.executionCtx.waitUntil(syncPromise);
      } catch {
        await syncPromise;
      }

      console.log(`[Webhook] School approved: ${body.school_name} (${body.school_id})`);
      return c.json({ success: true, organizationId: orgId });
    }

    case 'accessRevoked':
    case 'accessDeclined': {
      if (!body.school_id) {
        return c.json({ error: 'Missing school_id' }, 400);
      }

      const org = await db.prepare(
        'SELECT id FROM organizations WHERE wonde_school_id = ?'
      ).bind(body.school_id).first();

      if (org) {
        await db.prepare(
          'UPDATE organizations SET is_active = 0, updated_at = datetime("now") WHERE id = ?'
        ).bind(org.id).run();

        const reason = body.revoke_reason || body.decline_reason || 'No reason provided';
        console.log(`[Webhook] Access ${body.payload_type}: ${body.school_name} - ${reason}`);
      }

      return c.json({ success: true });
    }

    case 'schoolMigration': {
      console.log(`[Webhook] School migration: ${body.school_name} from ${body.migrate_from} to ${body.migrate_to}`);
      return c.json({ success: true });
    }

    default:
      return c.json({ success: true, message: 'Unknown payload type acknowledged' });
  }
});

export default webhooksRouter;
