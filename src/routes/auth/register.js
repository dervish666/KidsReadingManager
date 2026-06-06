/**
 * Account-creation and auth-discovery routes.
 *
 *   POST /demo      — credential-less demo JWT for the Learnalot demo teacher
 *   GET  /mode      — public auth-mode discovery for the SPA login UI
 *   POST /register  — new organization + owner account (feature-flagged)
 */

import { Hono } from 'hono';
import { generateId, generateUniqueSlug } from '../../utils/helpers.js';
import { validatePassword } from '../../utils/validation.js';
import {
  hashPassword,
  createAccessToken,
  createRefreshToken,
  createJWTPayload,
  buildRefreshCookie,
  ROLES,
} from '../../utils/crypto.js';
import { requireDB as getDB } from '../../utils/routeHelpers.js';

export const registerRouter = new Hono();

const DEMO_AUTH_PROVIDER = 'demo';
const DEMO_TOKEN_TTL = 60 * 60 * 1000; // 1 hour
// The public, credential-less demo must never mint a token above teacher.
// Pin the role in code rather than trusting whatever the seeded demo account
// carries in the DB — a misconfigured/elevated demo row (especially `owner`,
// which unlocks the cross-org X-Organization-Id switch) would otherwise hand
// anonymous users elevated privilege. Anything outside this allowlist fails
// safe to readonly.
const ALLOWED_DEMO_ROLES = [ROLES.READONLY, ROLES.TEACHER];

/**
 * POST /api/auth/demo
 * Issue a demo JWT for the Learnalot School demo teacher.
 * No credentials required. Rate limited via authRateLimit. No refresh token.
 */
registerRouter.post('/demo', async (c) => {
  const db = getDB(c.env);

  const demoUser = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.auth_provider,
              o.id as org_id, o.name as org_name, o.slug as org_slug
       FROM users u
       JOIN organizations o ON u.organization_id = o.id
       WHERE u.auth_provider = ? AND u.is_active = 1 AND o.is_active = 1
       LIMIT 1`
    )
    .bind(DEMO_AUTH_PROVIDER)
    .first();

  if (!demoUser) {
    return c.json({ error: 'Demo not available' }, 503);
  }

  const jwtSecret = c.env.JWT_SECRET;
  if (!jwtSecret) {
    return c.json({ error: 'Server configuration error' }, 500);
  }

  // Look up assigned class IDs (same as login endpoint)
  let assignedClassIds = [];
  try {
    const assignments = await db
      .prepare('SELECT class_id FROM class_assignments WHERE user_id = ?')
      .bind(demoUser.id)
      .all();
    assignedClassIds = (assignments.results || []).map((r) => r.class_id);
  } catch {
    /* class_assignments table may not exist */
  }

  // Hard-cap the demo role: never above teacher, regardless of the DB value.
  const demoRole = ALLOWED_DEMO_ROLES.includes(demoUser.role) ? demoUser.role : ROLES.READONLY;

  const payload = createJWTPayload(
    {
      id: demoUser.id,
      email: demoUser.email,
      name: demoUser.name,
      role: demoRole,
      authProvider: DEMO_AUTH_PROVIDER,
      assignedClassIds,
    },
    { id: demoUser.org_id, slug: demoUser.org_slug }
  );

  const accessToken = await createAccessToken(payload, jwtSecret, DEMO_TOKEN_TTL);

  return c.json({
    accessToken,
    user: {
      id: demoUser.id,
      email: demoUser.email,
      name: demoUser.name,
      role: demoRole,
      authProvider: DEMO_AUTH_PROVIDER,
      assignedClassIds,
    },
    organization: {
      id: demoUser.org_id,
      name: demoUser.org_name,
      slug: demoUser.org_slug,
    },
  });
});

/**
 * GET /api/auth/mode
 * Returns the authentication mode (legacy or multitenant)
 * This endpoint is public and used by the frontend to determine which login UI to show
 */
registerRouter.get('/mode', async (c) => {
  // Multi-tenant mode requires both JWT_SECRET and D1 database.
  // Only surface what the SPA actually consumes — the frontend reads `mode`
  // to pick a login UI and `ssoEnabled` to show the SSO button. Exposing
  // other infrastructure flags to an unauthenticated endpoint is a free
  // reconnaissance signal for attackers.
  const isMultiTenant = !!c.env.JWT_SECRET && !!c.env.READING_MANAGER_DB;

  return c.json({
    mode: isMultiTenant ? 'multitenant' : 'legacy',
    ssoEnabled: Boolean(c.env.MYLOGIN_CLIENT_ID),
  });
});

/**
 * POST /api/auth/register
 * Register a new organization and owner account
 *
 * Body: {
 *   organizationName: string,
 *   email: string,
 *   password: string,
 *   name: string (user's display name)
 * }
 */
registerRouter.post('/register', async (c) => {
  if (c.env.PUBLIC_REGISTRATION_ENABLED !== 'true') {
    return c.json({ error: 'Not found' }, 404);
  }
  try {
    const db = getDB(c.env);
    const body = await c.req.json();

    const { organizationName, email, password, name } = body;

    // Validate required fields
    if (!organizationName || !email || !password || !name) {
      return c.json(
        {
          error: 'Missing required fields',
          required: ['organizationName', 'email', 'password', 'name'],
        },
        400
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return c.json({ error: 'Invalid email format' }, 400);
    }

    // Validate password strength
    const pwCheck = validatePassword(password);
    if (!pwCheck.isValid) {
      return c.json({ error: pwCheck.error }, 400);
    }

    // Check if email already exists (among active users)
    const existingUser = await db
      .prepare('SELECT id FROM users WHERE email = ? AND is_active = 1')
      .bind(email.toLowerCase())
      .first();

    if (existingUser) {
      // Return generic error that doesn't reveal email existence
      return c.json(
        {
          error:
            'Registration could not be completed. Please try a different email or contact support.',
        },
        400
      );
    }

    // Generate IDs
    const orgId = generateId();
    const userId = generateId();
    let finalSlug = await generateUniqueSlug(db, organizationName);

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create organization and user in a transaction.
    // Retry on slug collision (TOCTOU race between the uniqueness check and INSERT).
    const createBatch = async (slugToUse) =>
      db.batch([
        db
          .prepare(
            `
        INSERT INTO organizations (id, name, slug, is_active)
        VALUES (?, ?, ?, 1)
      `
          )
          .bind(orgId, organizationName, slugToUse),

        // Create owner user
        db
          .prepare(
            `
        INSERT INTO users (id, organization_id, email, password_hash, name, role, is_active)
        VALUES (?, ?, ?, ?, ?, 'owner', 1)
      `
          )
          .bind(userId, orgId, email.toLowerCase(), passwordHash, name),
      ]);

    try {
      await createBatch(finalSlug);
    } catch (batchErr) {
      // Retry once on UNIQUE collision with a random suffix. Collision chance
      // with a 4-char random tail is ~1 in 1.6M, so a single retry is enough.
      if (batchErr.message?.includes('UNIQUE') || batchErr.message?.includes('constraint')) {
        finalSlug = `${finalSlug}-${crypto.randomUUID().slice(0, 4)}`;
        await createBatch(finalSlug);
      } else {
        throw batchErr;
      }
    }

    // Create tokens
    const jwtSecret = c.env.JWT_SECRET;
    if (!jwtSecret) {
      return c.json({ error: 'Server configuration error' }, 500);
    }

    const organization = { id: orgId, slug: finalSlug };
    const user = { id: userId, email: email.toLowerCase(), name, role: 'owner' };

    const payload = createJWTPayload(user, organization);
    const accessToken = await createAccessToken(payload, jwtSecret);
    const refreshTokenData = await createRefreshToken(userId, jwtSecret);

    // Store refresh token
    const refreshTokenId = generateId();
    await db
      .prepare(
        `
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `
      )
      .bind(refreshTokenId, userId, refreshTokenData.hash, refreshTokenData.expiresAt)
      .run();

    // Set refresh token as httpOnly cookie
    const isProduction = c.env.ENVIRONMENT !== 'development';
    c.header('Set-Cookie', buildRefreshCookie(refreshTokenData.token, isProduction));

    return c.json(
      {
        message: 'Registration successful',
        accessToken,
        user: {
          id: userId,
          email: email.toLowerCase(),
          name,
          role: 'owner',
        },
        organization: {
          id: orgId,
          name: organizationName,
          slug: finalSlug,
        },
      },
      201
    );
  } catch (error) {
    console.error('Registration error:', error);
    return c.json({ error: 'Registration failed' }, 500);
  }
});
