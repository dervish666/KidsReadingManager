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
import * as Sentry from '@sentry/cloudflare';
import {
  encryptSensitiveData,
  constantTimeStringEqual,
  getEncryptionSecret,
} from '../utils/crypto.js';
import { runFullSync } from '../services/wondeSync.js';
import { generateUniqueSlug } from '../utils/helpers.js';
import { fetchSchoolDetails } from '../utils/wondeApi.js';
import { invalidateOrgStatus } from '../utils/orgStatusCache.js';

const webhooksRouter = new Hono();

/**
 * Read `?secret=` out of the raw URL *without* form-decoding it.
 *
 * `URLSearchParams` follows application/x-www-form-urlencoded rules, which turn
 * a literal `+` into a space. The Wonde secret is base64, so it contains `+`
 * and `/` more often than not — reading it via `searchParams` silently mangles
 * it and every delivery 401s with a secret that looks correct in both places.
 * Percent-escapes are still honoured, so a sender that encodes properly works
 * either way.
 */
function readQuerySecret(url) {
  const start = url.indexOf('?');
  if (start === -1) return '';
  for (const pair of url.slice(start + 1).split('&')) {
    const eq = pair.indexOf('=');
    if (eq === -1 || pair.slice(0, eq) !== 'secret') continue;
    const raw = pair.slice(eq + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return '';
}

webhooksRouter.post('/wonde', async (c) => {
  // Verify the webhook shared secret. Set WONDE_WEBHOOK_SECRET in Cloudflare,
  // then give Wonde the value by *either* route:
  //
  //   - `X-Webhook-Secret: <value>` request header (preferred — keeps the
  //     secret out of URLs), or
  //   - `?secret=<value>` appended to the webhook URL in the Wonde dashboard.
  //
  // Both are accepted deliberately. v3.35.1 moved this to header-only on the
  // sound reasoning that query strings leak into logs, but nobody could change
  // Wonde's side to match: their webhook dashboard exposes a URL field and
  // event checkboxes, with nowhere to set a custom header. The comment here
  // still described the query param for four months while the code required
  // the header, so the two ends of the wire disagreed and every delivery would
  // have 401'd. If Wonde ever adds header support, drop the query branch and
  // rotate the secret.
  const webhookSecret = c.env.WONDE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[Webhook] WONDE_WEBHOOK_SECRET not configured — rejecting request');
    return c.json({ error: 'Webhook authentication not configured' }, 503);
  }

  const headerSecret = c.req.header('X-Webhook-Secret') || '';
  const querySecret = readQuerySecret(c.req.url);
  const viaHeader = Boolean(headerSecret) && constantTimeStringEqual(headerSecret, webhookSecret);
  const viaQuery =
    !viaHeader && Boolean(querySecret) && constantTimeStringEqual(querySecret, webhookSecret);

  if (!viaHeader && !viaQuery) {
    console.warn(
      `[Webhook] Invalid or missing webhook secret (header ${headerSecret ? 'present' : 'absent'}, query ${querySecret ? 'present' : 'absent'})`
    );
    return c.json({ error: 'Unauthorized' }, 401);
  }

  if (viaQuery) {
    // Not an error — it is the only mechanism Wonde's dashboard supports — but
    // it means the secret is sitting in Cloudflare and intermediary request
    // logs, so it should be treated as low-trust and rotated periodically.
    console.warn('[Webhook] Authenticated via ?secret= query string; secret is exposed in logs');
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

      // Verify school + token pair with Wonde before any DB write. This is the
      // single load-bearing defence against a leaked WONDE_WEBHOOK_SECRET: an
      // attacker who knows the secret must also supply a valid token that Wonde
      // itself binds to the claimed school_id, which is equivalent to already
      // having Wonde access for that school.
      let schoolDetails;
      try {
        schoolDetails = await fetchSchoolDetails(body.school_token, body.school_id);
      } catch (err) {
        // Distinguish "this token will never work" from "Wonde was having a
        // moment". Both used to return 400, so a transient outage during the
        // one-shot approval silently dropped a school for good — and a genuinely
        // dead token looked like an outage. Wonde re-delivers on a non-2xx
        // (observed: 3 attempts per failed delivery), so a 503 buys a retry
        // while a 400 correctly ends it.
        const permanent = err.status === 401 || err.status === 403;
        console.warn(
          `[Webhook] schoolApproved verification failed for school_id=${body.school_id} (${permanent ? 'permanent' : 'transient'}): ${err.message}`
        );

        if (permanent) {
          return c.json({ error: 'Could not verify school with Wonde' }, 400);
        }

        // Transient: report it, because an approval is a one-shot event and a
        // school that silently never arrives is invisible to everyone.
        Sentry.captureException(new Error('Wonde verification failed transiently at approval'), {
          level: 'warning',
          tags: { wonde: 'school-approved' },
          extra: { wondeSchoolId: body.school_id, status: err.status, message: err.message },
        });
        return c.json({ error: 'Could not reach Wonde, please retry' }, 503);
      }

      if (!schoolDetails || schoolDetails.id !== body.school_id) {
        console.warn(
          `[Webhook] schoolApproved verification returned mismatched school_id (expected=${body.school_id}, got=${schoolDetails?.id})`
        );
        return c.json({ error: 'Could not verify school with Wonde' }, 400);
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
        const finalSlug = await generateUniqueSlug(db, schoolName);

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

      // Trigger full sync in background.
      //
      // This is the school's very first impression: if it fails, they sign in
      // to an empty school and nothing on screen distinguishes "sync failed"
      // from "not synced yet". Nobody there can retry either — POST
      // /api/wonde/sync needs admin, and a freshly onboarded school may have
      // none. So the failure is reported rather than left in the sync log for
      // someone to find.
      //
      // captureException (not a console.warn) is right here where it would be
      // wrong in a per-minute cron: this fires at most once per school
      // onboarding, so it cannot become noise. No bespoke retry — the 3 AM
      // nightly sync already is the retry.
      const syncPromise = runFullSync(orgId, body.school_token, body.school_id, db, {
        kv: c.env.READING_MANAGER_KV,
      }).then((result) => {
        if (result?.status === 'failed') {
          console.error(
            `[Webhook] Onboarding sync failed for ${schoolName} (${body.school_id}): ${result.errorMessage}`
          );
          Sentry.captureException(new Error('Wonde onboarding sync failed'), {
            level: 'error',
            tags: { wonde: 'onboarding-sync' },
            extra: {
              orgId,
              schoolName,
              wondeSchoolId: body.school_id,
              errorMessage: result.errorMessage,
            },
          });
        }
        return result;
      });
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

        // Drop the cached subscription/status entry immediately. Without this
        // the org keeps serving from cache for up to its TTL, so a school that
        // has just revoked our access to their MIS carries on being readable
        // for another minute.
        try {
          await invalidateOrgStatus(c.env, org.id);
        } catch (err) {
          console.warn('[Webhook] Could not invalidate cached org status:', err.message);
        }

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
