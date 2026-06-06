/**
 * JWT session lifecycle routes.
 *
 *   POST /login    — email/password authentication (with account lockout)
 *   POST /refresh  — rotate the refresh token, mint a new access token
 *   POST /logout   — revoke the refresh token and clear the cookie
 *   GET  /me       — current user info (requires authentication)
 */

import { Hono } from 'hono';
import { generateId } from '../../utils/helpers.js';
import {
  hashPassword,
  verifyPassword,
  createAccessToken,
  createRefreshToken,
  createJWTPayload,
  hashToken,
  buildRefreshCookie,
  buildClearRefreshCookie,
  DUMMY_PASSWORD_HASH,
} from '../../utils/crypto.js';
import { requireDB as getDB } from '../../utils/routeHelpers.js';
import {
  parseCookies,
  isAccountLocked,
  recordLoginAttempt,
  clearFailedAttempts,
  LOCKOUT_DURATION_MINUTES,
} from './_shared.js';

export const sessionRouter = new Hono();

/**
 * POST /api/auth/login
 * Authenticate user with email and password
 *
 * Body: {
 *   email: string,
 *   password: string
 * }
 */
sessionRouter.post('/login', async (c) => {
  try {
    const db = getDB(c.env);
    const body = await c.req.json();

    const { email, password } = body;

    if (!email || !password) {
      return c.json({ error: 'Email and password required' }, 400);
    }

    // Get client info for logging
    const ipAddress =
      c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
    const userAgent = c.req.header('user-agent') || 'unknown';

    // Check if account is locked due to too many failed attempts
    if (await isAccountLocked(db, email)) {
      return c.json(
        {
          error:
            'Account temporarily locked due to too many failed login attempts. Please try again later.',
          retryAfter: LOCKOUT_DURATION_MINUTES * 60,
        },
        429
      );
    }

    // Find user by email (only active users in active orgs)
    const user = await db
      .prepare(
        `
      SELECT u.*, o.name as org_name, o.slug as org_slug, o.is_active as org_active
      FROM users u
      INNER JOIN organizations o ON u.organization_id = o.id
      WHERE u.email = ? AND u.is_active = 1 AND o.is_active = 1
    `
      )
      .bind(email.toLowerCase())
      .first();

    if (!user) {
      // Timing parity (M18): run the same verify path as the user-found case
      // against a fixed dummy hash. The result is always invalid, but the
      // PBKDF2 compute shape matches exactly — closes the hashPassword vs
      // verifyPassword code-path delta that leaked email existence.
      await verifyPassword(password, DUMMY_PASSWORD_HASH);
      await recordLoginAttempt(db, email, ipAddress, userAgent, false);
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    // Verify password (supports both old 100k and new 600k iterations)
    const passwordResult = await verifyPassword(password, user.password_hash);
    if (!passwordResult.valid) {
      await recordLoginAttempt(db, email, ipAddress, userAgent, false);
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    // Successful login - record it and clear failed attempts
    await recordLoginAttempt(db, email, ipAddress, userAgent, true);
    await clearFailedAttempts(db, email);

    // If password was hashed with old iteration count, rehash with new count
    if (passwordResult.needsRehash) {
      try {
        const newHash = await hashPassword(password);
        await db
          .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
          .bind(newHash, user.id)
          .run();
      } catch (rehashError) {
        // Don't fail login if rehash fails, just log it
        console.error('Failed to upgrade password hash:', rehashError);
      }
    }

    // Update last login
    await db
      .prepare('UPDATE users SET last_login_at = datetime("now") WHERE id = ?')
      .bind(user.id)
      .run();

    // Create tokens
    const jwtSecret = c.env.JWT_SECRET;
    if (!jwtSecret) {
      return c.json({ error: 'Server configuration error' }, 500);
    }

    // Look up assigned class IDs
    let assignedClassIds = [];
    try {
      const assignments = await db
        .prepare('SELECT class_id FROM class_assignments WHERE user_id = ?')
        .bind(user.id)
        .all();
      assignedClassIds = (assignments.results || []).map((r) => r.class_id);
    } catch {
      /* class_assignments table may not exist */
    }

    const organization = { id: user.organization_id, slug: user.org_slug };
    const userForPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      assignedClassIds,
    };

    const payload = createJWTPayload(userForPayload, organization);
    const accessToken = await createAccessToken(payload, jwtSecret);
    const refreshTokenData = await createRefreshToken(user.id, jwtSecret);

    // Store refresh token
    const refreshTokenId = generateId();
    await db
      .prepare(
        `
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `
      )
      .bind(refreshTokenId, user.id, refreshTokenData.hash, refreshTokenData.expiresAt)
      .run();

    // Set refresh token as httpOnly cookie for enhanced security
    const isProduction = c.env.ENVIRONMENT !== 'development';
    c.header('Set-Cookie', buildRefreshCookie(refreshTokenData.token, isProduction));

    return c.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        assignedClassIds,
      },
      organization: {
        id: user.organization_id,
        name: user.org_name,
        slug: user.org_slug,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: 'Login failed' }, 500);
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 *
 * Accepts refresh token from:
 * 1. httpOnly cookie (preferred, more secure)
 * 2. Request body (backward compatibility)
 */
sessionRouter.post('/refresh', async (c) => {
  try {
    const db = getDB(c.env);

    // Try to get refresh token from httpOnly cookie first (more secure)
    const cookies = parseCookies(c.req.header('cookie'));
    let refreshToken = cookies.refresh_token;

    // Fall back to request body for backward compatibility
    if (!refreshToken) {
      const body = await c.req.json().catch(() => ({}));
      refreshToken = body.refreshToken;
    }

    if (!refreshToken) {
      return c.json({ error: 'Refresh token required' }, 400);
    }

    // Hash the provided token to compare with stored hash
    const tokenHash = await hashToken(refreshToken);

    // Find the refresh token
    const storedToken = await db
      .prepare(
        `
      SELECT rt.*, u.email, u.name, u.role, u.auth_provider, u.is_active as user_active,
             o.id as org_id, o.name as org_name, o.slug as org_slug, o.is_active as org_active
      FROM refresh_tokens rt
      INNER JOIN users u ON rt.user_id = u.id
      INNER JOIN organizations o ON u.organization_id = o.id
      WHERE rt.token_hash = ? AND rt.revoked_at IS NULL AND rt.expires_at > datetime('now')
    `
      )
      .bind(tokenHash)
      .first();

    if (!storedToken) {
      // Check if this is a revoked token (reuse detection)
      const revokedToken = await db
        .prepare(
          `SELECT rt.user_id FROM refresh_tokens rt
           WHERE rt.token_hash = ? AND rt.revoked_at IS NOT NULL`
        )
        .bind(tokenHash)
        .first();

      if (revokedToken) {
        // Token reuse detected — revoke ALL tokens for this user (theft indicator)
        console.warn(
          `[Auth] Refresh token reuse detected for user ${revokedToken.user_id} — revoking all tokens`
        );
        await db
          .prepare(
            'UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE user_id = ? AND revoked_at IS NULL'
          )
          .bind(revokedToken.user_id)
          .run();
      }

      return c.json({ error: 'Invalid refresh token' }, 401);
    }

    // Defense-in-depth against D1/Worker clock skew
    if (new Date(storedToken.expires_at) < new Date()) {
      return c.json({ error: 'Refresh token expired' }, 401);
    }

    // Check if user is active
    if (!storedToken.user_active) {
      return c.json({ error: 'Account is deactivated' }, 403);
    }

    // Check if organization is active
    if (!storedToken.org_active) {
      return c.json({ error: 'Organization is inactive' }, 403);
    }

    // Revoke old refresh token
    await db
      .prepare('UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE id = ?')
      .bind(storedToken.id)
      .run();

    // Create new tokens
    const jwtSecret = c.env.JWT_SECRET;
    if (!jwtSecret) {
      return c.json({ error: 'Server configuration error' }, 500);
    }

    // Look up assigned class IDs
    let assignedClassIds = [];
    try {
      const assignments = await db
        .prepare('SELECT class_id FROM class_assignments WHERE user_id = ?')
        .bind(storedToken.user_id)
        .all();
      assignedClassIds = (assignments.results || []).map((r) => r.class_id);
    } catch {
      /* class_assignments table may not exist */
    }

    const organization = { id: storedToken.org_id, slug: storedToken.org_slug };
    const user = {
      id: storedToken.user_id,
      email: storedToken.email,
      name: storedToken.name,
      role: storedToken.role,
      authProvider: storedToken.auth_provider || 'local',
      assignedClassIds,
    };

    const payload = createJWTPayload(user, organization);
    const accessToken = await createAccessToken(payload, jwtSecret);
    const newRefreshTokenData = await createRefreshToken(storedToken.user_id, jwtSecret);

    // Store new refresh token
    const newRefreshTokenId = generateId();
    await db
      .prepare(
        `
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `
      )
      .bind(
        newRefreshTokenId,
        storedToken.user_id,
        newRefreshTokenData.hash,
        newRefreshTokenData.expiresAt
      )
      .run();

    // Set new refresh token as httpOnly cookie
    const isProduction = c.env.ENVIRONMENT !== 'development';
    c.header('Set-Cookie', buildRefreshCookie(newRefreshTokenData.token, isProduction));

    return c.json({
      accessToken,
      user: {
        id: storedToken.user_id,
        email: storedToken.email,
        name: storedToken.name,
        role: storedToken.role,
        authProvider: storedToken.auth_provider || 'local',
        assignedClassIds,
      },
      organization: {
        id: storedToken.org_id,
        name: storedToken.org_name,
        slug: storedToken.org_slug,
      },
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return c.json({ error: 'Token refresh failed' }, 500);
  }
});

/**
 * POST /api/auth/logout
 * Revoke refresh token and clear cookie
 *
 * Accepts refresh token from:
 * 1. httpOnly cookie (preferred)
 * 2. Request body (backward compatibility)
 */
sessionRouter.post('/logout', async (c) => {
  try {
    const db = getDB(c.env);

    // Try to get refresh token from cookie first
    const cookies = parseCookies(c.req.header('cookie'));
    let refreshToken = cookies.refresh_token;

    // Fall back to request body
    if (!refreshToken) {
      const body = await c.req.json().catch(() => ({}));
      refreshToken = body.refreshToken;
    }

    if (refreshToken) {
      const tokenHash = await hashToken(refreshToken);
      await db
        .prepare('UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE token_hash = ?')
        .bind(tokenHash)
        .run();
    }

    // Clear the refresh token cookie
    const isProduction = c.env.ENVIRONMENT !== 'development';
    c.header('Set-Cookie', buildClearRefreshCookie(isProduction));

    return c.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    return c.json({ error: 'Logout failed' }, 500);
  }
});

/**
 * GET /api/auth/me
 * Get current user info (requires authentication)
 */
sessionRouter.get('/me', async (c) => {
  try {
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const db = getDB(c.env);

    // Get full user and organization details
    const fullUser = await db
      .prepare(
        `
      SELECT u.id, u.email, u.name, u.role, u.last_login_at, u.created_at,
             o.id as org_id, o.name as org_name, o.slug as org_slug
      FROM users u
      INNER JOIN organizations o ON u.organization_id = o.id
      WHERE u.id = ? AND u.is_active = 1 AND o.is_active = 1
    `
      )
      .bind(user.sub)
      .first();

    if (!fullUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({
      user: {
        id: fullUser.id,
        email: fullUser.email,
        name: fullUser.name,
        role: fullUser.role,
        lastLoginAt: fullUser.last_login_at,
        createdAt: fullUser.created_at,
      },
      organization: {
        id: fullUser.org_id,
        name: fullUser.org_name,
        slug: fullUser.org_slug,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    return c.json({ error: 'Failed to get user info' }, 500);
  }
});
