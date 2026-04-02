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
import {
  encryptSensitiveData,
  constantTimeStringEqual,
  getEncryptionSecret,
} from '../utils/crypto.js';
import { runFullSync } from '../services/wondeSync.js';
import { fetchSchoolDetails } from '../utils/wondeApi.js';

const webhooksRouter = new Hono();

webhooksRouter.post('/wonde', async (c) => {
  // Verify webhook shared secret
  // Configure WONDE_WEBHOOK_SECRET in Cloudflare and append ?secret=<value>
  // to the webhook URL in the Wonde dashboard
  const webhookSecret = c.env.WONDE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[Webhook] WONDE_WEBHOOK_SECRET not configured — rejecting request');
    return c.json({ error: 'Webhook authentication not configured' }, 503);
  }

  const providedSecret = c.req.header('X-Webhook-Secret') || '';
  if (!providedSecret || !constantTimeStringEqual(providedSecret, webhookSecret)) {
    console.warn('[Webhook] Invalid or missing webhook secret');
    return c.json({ error: 'Unauthorized' }, 401);
  }

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

      // Sanitise school name (from external webhook payload)
      const schoolName = (body.school_name || '').trim().substring(0, 200);

      // Check for existing organization with same wonde_school_id
      const existing = await db
        .prepare(`SELECT id, is_active FROM organizations WHERE wonde_school_id = ?`)
        .bind(body.school_id)
        .first();

      // Encrypt school token
      const encryptedToken = await encryptSensitiveData(
        body.school_token,
        getEncryptionSecret(c.env)
      );

      // Fetch school contact details from Wonde (address, phone, email)
      let schoolDetails = null;
      try {
        schoolDetails = await fetchSchoolDetails(body.school_token, body.school_id);
      } catch (err) {
        console.warn(`[Webhook] Could not fetch school details: ${err.message}`);
      }

      const contactEmail = (schoolDetails?.email || '').trim().substring(0, 200) || null;
      const phone = (schoolDetails?.phone_number || '').trim().substring(0, 50) || null;
      const addressLine1 =
        (schoolDetails?.address?.address_line_1 || '').trim().substring(0, 200) || null;
      const addressLine2 =
        (schoolDetails?.address?.address_line_2 || '').trim().substring(0, 200) || null;
      const town = (schoolDetails?.address?.address_town || '').trim().substring(0, 100) || null;
      const postcode =
        (schoolDetails?.address?.address_postcode || '').trim().substring(0, 20) || null;

      let orgId;
      if (existing) {
        orgId = existing.id;
        // Reactivate and update token + contact details if previously revoked
        await db
          .prepare(
            `UPDATE organizations SET
            is_active = 1, wonde_school_token = ?, name = ?,
            contact_email = COALESCE(?, contact_email),
            phone = COALESCE(?, phone),
            address_line_1 = COALESCE(?, address_line_1),
            address_line_2 = COALESCE(?, address_line_2),
            town = COALESCE(?, town),
            postcode = COALESCE(?, postcode),
            updated_at = datetime("now")
           WHERE id = ?`
          )
          .bind(
            encryptedToken,
            schoolName,
            contactEmail,
            phone,
            addressLine1,
            addressLine2,
            town,
            postcode,
            orgId
          )
          .run();
        console.log(
          `[Webhook] School re-approved: ${schoolName} (${body.school_id}), reactivated org ${orgId}`
        );
      } else {
        orgId = crypto.randomUUID();
        const baseSlug =
          schoolName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || 'school';
        let finalSlug = baseSlug;
        let slugCounter = 1;
        while (slugCounter <= 100) {
          const existing2 = await db
            .prepare('SELECT id FROM organizations WHERE slug = ?')
            .bind(finalSlug)
            .first();
          if (!existing2) break;
          finalSlug = `${baseSlug}-${slugCounter++}`;
        }

        await db
          .prepare(
            `INSERT INTO organizations (id, name, slug, wonde_school_id, wonde_school_token,
            contact_email, phone, address_line_1, address_line_2, town, postcode,
            is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime("now"), datetime("now"))`
          )
          .bind(
            orgId,
            schoolName,
            finalSlug,
            body.school_id,
            encryptedToken,
            contactEmail,
            phone,
            addressLine1,
            addressLine2,
            town,
            postcode
          )
          .run();
        console.log(
          `[Webhook] School approved: ${schoolName} (${body.school_id}), created org ${orgId}`
        );
      }

      // Trigger full sync in background
      const syncPromise = runFullSync(orgId, body.school_token, body.school_id, db);
      try {
        // executionCtx is a read-only getter that throws when unavailable
        c.executionCtx.waitUntil(syncPromise);
      } catch {
        await syncPromise;
      }

      return c.json({ success: true });
    }

    case 'accessRevoked':
    case 'accessDeclined': {
      if (!body.school_id) {
        return c.json({ error: 'Missing school_id' }, 400);
      }

      const org = await db
        .prepare('SELECT id FROM organizations WHERE wonde_school_id = ?')
        .bind(body.school_id)
        .first();

      if (org) {
        await db
          .prepare(
            'UPDATE organizations SET is_active = 0, updated_at = datetime("now") WHERE id = ?'
          )
          .bind(org.id)
          .run();

        const reason = body.revoke_reason || body.decline_reason || 'No reason provided';
        console.log(`[Webhook] Access ${body.payload_type}: ${body.school_name} - ${reason}`);
      }

      return c.json({ success: true });
    }

    case 'schoolMigration': {
      // schoolMigration fires when a school changes MIS provider. The school
      // token may change — a new schoolApproved webhook should follow with the
      // updated token. Log for awareness; no action required here.
      console.log(
        `[Webhook] School migration: ${body.school_name} from ${body.migrate_from} to ${body.migrate_to}`
      );
      return c.json({ success: true });
    }

    default:
      return c.json({ success: true, message: 'Unknown payload type acknowledged' });
  }
});

export default webhooksRouter;
