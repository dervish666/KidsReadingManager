/**
 * Authentication Routes
 * Handles user registration, login, token refresh, and password reset
 */

import { Hono } from 'hono';
import { generateId } from '../utils/helpers.js';
import {
  hashPassword,
  verifyPassword,
  createAccessToken,
  createRefreshToken,
  createJWTPayload,
  hashToken
} from '../utils/crypto.js';
import { authRateLimit } from '../middleware/tenant.js';
import { sendPasswordResetEmail } from '../utils/email.js';

export const authRouter = new Hono();

// Apply stricter rate limiting to all auth endpoints
// This provides an additional layer of protection beyond account lockout
authRouter.use('*', authRateLimit());

/**
 * GET /api/auth/mode
 * Returns the authentication mode (legacy or multitenant)
 * This endpoint is public and used by the frontend to determine which login UI to show
 */
authRouter.get('/mode', async (c) => {
  const hasJwtSecret = !!c.env.JWT_SECRET;
  const hasD1 = !!c.env.READING_MANAGER_DB;
  
  // Multi-tenant mode requires both JWT_SECRET and D1 database
  const isMultiTenant = hasJwtSecret && hasD1;
  
  return c.json({
    mode: isMultiTenant ? 'multitenant' : 'legacy',
    features: {
      multiTenant: isMultiTenant,
      d1Database: hasD1,
      kvStorage: !!c.env.READING_MANAGER_KV
    }
  });
});

/**
 * Helper to get D1 database
 */
const getDB = (env) => {
  if (!env || !env.READING_MANAGER_DB) {
    throw new Error('Database not available');
  }
  return env.READING_MANAGER_DB;
};

/**
 * Generate URL-safe slug from organization name
 */
function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

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
authRouter.post('/register', async (c) => {
  try {
    const db = getDB(c.env);
    const body = await c.req.json();

    const { organizationName, email, password, name } = body;

    // Validate required fields
    if (!organizationName || !email || !password || !name) {
      return c.json({ 
        error: 'Missing required fields',
        required: ['organizationName', 'email', 'password', 'name']
      }, 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return c.json({ error: 'Invalid email format' }, 400);
    }

    // Validate password strength
    if (password.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters' }, 400);
    }

    // Check if email already exists
    const existingUser = await db.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first();

    if (existingUser) {
      return c.json({ error: 'Email already registered' }, 409);
    }

    // Generate IDs
    const orgId = generateId();
    const userId = generateId();
    const slug = generateSlug(organizationName);

    // Check if slug is unique, append number if needed
    let finalSlug = slug;
    let slugCounter = 1;
    while (true) {
      const existingOrg = await db.prepare(
        'SELECT id FROM organizations WHERE slug = ?'
      ).bind(finalSlug).first();

      if (!existingOrg) break;
      finalSlug = `${slug}-${slugCounter++}`;
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create organization and user in a transaction
    await db.batch([
      // Create organization
      db.prepare(`
        INSERT INTO organizations (id, name, slug, subscription_tier, max_students, max_teachers, is_active)
        VALUES (?, ?, ?, 'free', 50, 3, 1)
      `).bind(orgId, organizationName, finalSlug),

      // Create owner user
      db.prepare(`
        INSERT INTO users (id, organization_id, email, password_hash, name, role, is_active)
        VALUES (?, ?, ?, ?, ?, 'owner', 1)
      `).bind(userId, orgId, email.toLowerCase(), passwordHash, name)
    ]);

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
    await db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind(refreshTokenId, userId, refreshTokenData.hash, refreshTokenData.expiresAt).run();

    // Set refresh token as httpOnly cookie
    const isProduction = c.env.ENVIRONMENT !== 'development';
    const cookieOptions = [
      `refresh_token=${refreshTokenData.token}`,
      'HttpOnly',
      'Path=/api/auth',
      `Max-Age=${7 * 24 * 60 * 60}`,
      'SameSite=Strict',
      isProduction ? 'Secure' : ''
    ].filter(Boolean).join('; ');

    c.header('Set-Cookie', cookieOptions);

    return c.json({
      message: 'Registration successful',
      accessToken,
      // Still include refresh token for backward compatibility
      refreshToken: refreshTokenData.token,
      user: {
        id: userId,
        email: email.toLowerCase(),
        name,
        role: 'owner'
      },
      organization: {
        id: orgId,
        name: organizationName,
        slug: finalSlug
      }
    }, 201);

  } catch (error) {
    console.error('Registration error:', error);
    return c.json({ error: 'Registration failed' }, 500);
  }
});

// Account lockout configuration
const MAX_LOGIN_ATTEMPTS = 5;        // Maximum failed attempts before lockout
const LOCKOUT_DURATION_MINUTES = 15; // Lockout duration in minutes

/**
 * Check if account is locked due to too many failed attempts
 */
async function isAccountLocked(db, email) {
  try {
    const result = await db.prepare(`
      SELECT COUNT(*) as count FROM login_attempts
      WHERE email = ? AND success = 0
      AND created_at > datetime('now', '-${LOCKOUT_DURATION_MINUTES} minutes')
    `).bind(email.toLowerCase()).first();

    return result && result.count >= MAX_LOGIN_ATTEMPTS;
  } catch (error) {
    // If table doesn't exist yet, account is not locked
    console.error('Error checking account lock status:', error);
    return false;
  }
}

/**
 * Record a login attempt
 */
async function recordLoginAttempt(db, email, ipAddress, userAgent, success) {
  try {
    await db.prepare(`
      INSERT INTO login_attempts (id, email, ip_address, user_agent, success)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      generateId(),
      email.toLowerCase(),
      ipAddress || 'unknown',
      userAgent || 'unknown',
      success ? 1 : 0
    ).run();

    // Cleanup old attempts (older than 24 hours) - async, don't wait
    db.prepare(`
      DELETE FROM login_attempts WHERE created_at < datetime('now', '-24 hours')
    `).run().catch(() => {});
  } catch (error) {
    // Don't fail login if logging fails
    console.error('Error recording login attempt:', error);
  }
}

/**
 * Clear failed login attempts on successful login
 */
async function clearFailedAttempts(db, email) {
  try {
    await db.prepare(`
      DELETE FROM login_attempts WHERE email = ? AND success = 0
    `).bind(email.toLowerCase()).run();
  } catch (error) {
    console.error('Error clearing failed attempts:', error);
  }
}

/**
 * POST /api/auth/login
 * Authenticate user with email and password
 *
 * Body: {
 *   email: string,
 *   password: string
 * }
 */
authRouter.post('/login', async (c) => {
  try {
    const db = getDB(c.env);
    const body = await c.req.json();

    const { email, password } = body;

    if (!email || !password) {
      return c.json({ error: 'Email and password required' }, 400);
    }

    // Get client info for logging
    const ipAddress = c.req.header('cf-connecting-ip') ||
                      c.req.header('x-forwarded-for') ||
                      'unknown';
    const userAgent = c.req.header('user-agent') || 'unknown';

    // Check if account is locked due to too many failed attempts
    if (await isAccountLocked(db, email)) {
      return c.json({
        error: 'Account temporarily locked due to too many failed login attempts. Please try again later.',
        retryAfter: LOCKOUT_DURATION_MINUTES * 60
      }, 429);
    }

    // Find user by email
    const user = await db.prepare(`
      SELECT u.*, o.name as org_name, o.slug as org_slug, o.is_active as org_active
      FROM users u
      INNER JOIN organizations o ON u.organization_id = o.id
      WHERE u.email = ?
    `).bind(email.toLowerCase()).first();

    if (!user) {
      // Record failed attempt even for non-existent users (prevents enumeration timing)
      await recordLoginAttempt(db, email, ipAddress, userAgent, false);
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    // Check if user is active
    if (!user.is_active) {
      await recordLoginAttempt(db, email, ipAddress, userAgent, false);
      return c.json({ error: 'Account is deactivated' }, 403);
    }

    // Check if organization is active
    if (!user.org_active) {
      await recordLoginAttempt(db, email, ipAddress, userAgent, false);
      return c.json({ error: 'Organization is inactive' }, 403);
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
        await db.prepare(
          'UPDATE users SET password_hash = ? WHERE id = ?'
        ).bind(newHash, user.id).run();
      } catch (rehashError) {
        // Don't fail login if rehash fails, just log it
        console.error('Failed to upgrade password hash:', rehashError);
      }
    }

    // Update last login
    await db.prepare(
      'UPDATE users SET last_login_at = datetime("now") WHERE id = ?'
    ).bind(user.id).run();

    // Create tokens
    const jwtSecret = c.env.JWT_SECRET;
    if (!jwtSecret) {
      return c.json({ error: 'Server configuration error' }, 500);
    }

    const organization = { id: user.organization_id, slug: user.org_slug };
    const userForPayload = { 
      id: user.id, 
      email: user.email, 
      name: user.name, 
      role: user.role 
    };

    const payload = createJWTPayload(userForPayload, organization);
    const accessToken = await createAccessToken(payload, jwtSecret);
    const refreshTokenData = await createRefreshToken(user.id, jwtSecret);

    // Store refresh token
    const refreshTokenId = generateId();
    await db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind(refreshTokenId, user.id, refreshTokenData.hash, refreshTokenData.expiresAt).run();

    // Set refresh token as httpOnly cookie for enhanced security
    // This prevents XSS attacks from stealing the refresh token
    const isProduction = c.env.ENVIRONMENT !== 'development';
    const cookieOptions = [
      `refresh_token=${refreshTokenData.token}`,
      'HttpOnly',                           // Not accessible via JavaScript
      'Path=/api/auth',                     // Only sent to auth endpoints
      `Max-Age=${7 * 24 * 60 * 60}`,        // 7 days in seconds
      'SameSite=Strict',                    // CSRF protection
      isProduction ? 'Secure' : ''          // HTTPS only in production
    ].filter(Boolean).join('; ');

    c.header('Set-Cookie', cookieOptions);

    return c.json({
      accessToken,
      // Still include refresh token in response for backward compatibility
      // Frontend should migrate to using cookies instead
      refreshToken: refreshTokenData.token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      organization: {
        id: user.organization_id,
        name: user.org_name,
        slug: user.org_slug
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: 'Login failed' }, 500);
  }
});

/**
 * Helper to parse cookies from request
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) {
      cookies[name] = rest.join('=');
    }
  });
  return cookies;
}

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 *
 * Accepts refresh token from:
 * 1. httpOnly cookie (preferred, more secure)
 * 2. Request body (backward compatibility)
 */
authRouter.post('/refresh', async (c) => {
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
    const storedToken = await db.prepare(`
      SELECT rt.*, u.email, u.name, u.role, u.is_active as user_active,
             o.id as org_id, o.name as org_name, o.slug as org_slug, o.is_active as org_active
      FROM refresh_tokens rt
      INNER JOIN users u ON rt.user_id = u.id
      INNER JOIN organizations o ON u.organization_id = o.id
      WHERE rt.token_hash = ? AND rt.revoked_at IS NULL
    `).bind(tokenHash).first();

    if (!storedToken) {
      return c.json({ error: 'Invalid refresh token' }, 401);
    }

    // Check if token is expired
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
    await db.prepare(
      'UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE id = ?'
    ).bind(storedToken.id).run();

    // Create new tokens
    const jwtSecret = c.env.JWT_SECRET;
    if (!jwtSecret) {
      return c.json({ error: 'Server configuration error' }, 500);
    }

    const organization = { id: storedToken.org_id, slug: storedToken.org_slug };
    const user = { 
      id: storedToken.user_id, 
      email: storedToken.email, 
      name: storedToken.name, 
      role: storedToken.role 
    };

    const payload = createJWTPayload(user, organization);
    const accessToken = await createAccessToken(payload, jwtSecret);
    const newRefreshTokenData = await createRefreshToken(storedToken.user_id, jwtSecret);

    // Store new refresh token
    const newRefreshTokenId = generateId();
    await db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind(newRefreshTokenId, storedToken.user_id, newRefreshTokenData.hash, newRefreshTokenData.expiresAt).run();

    // Set new refresh token as httpOnly cookie
    const isProduction = c.env.ENVIRONMENT !== 'development';
    const cookieOptions = [
      `refresh_token=${newRefreshTokenData.token}`,
      'HttpOnly',
      'Path=/api/auth',
      `Max-Age=${7 * 24 * 60 * 60}`,
      'SameSite=Strict',
      isProduction ? 'Secure' : ''
    ].filter(Boolean).join('; ');

    c.header('Set-Cookie', cookieOptions);

    return c.json({
      accessToken,
      // Still include refresh token in response for backward compatibility
      refreshToken: newRefreshTokenData.token,
      user: {
        id: storedToken.user_id,
        email: storedToken.email,
        name: storedToken.name,
        role: storedToken.role
      },
      organization: {
        id: storedToken.org_id,
        name: storedToken.org_name,
        slug: storedToken.org_slug
      }
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
authRouter.post('/logout', async (c) => {
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
      await db.prepare(
        'UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE token_hash = ?'
      ).bind(tokenHash).run();
    }

    // Clear the refresh token cookie
    const isProduction = c.env.ENVIRONMENT !== 'development';
    const clearCookieOptions = [
      'refresh_token=',
      'HttpOnly',
      'Path=/api/auth',
      'Max-Age=0',  // Expire immediately
      'SameSite=Strict',
      isProduction ? 'Secure' : ''
    ].filter(Boolean).join('; ');

    c.header('Set-Cookie', clearCookieOptions);

    return c.json({ message: 'Logged out successfully' });

  } catch (error) {
    console.error('Logout error:', error);
    return c.json({ error: 'Logout failed' }, 500);
  }
});

/**
 * POST /api/auth/forgot-password
 * Request password reset email
 * 
 * Body: {
 *   email: string
 * }
 */
authRouter.post('/forgot-password', async (c) => {
  try {
    const db = getDB(c.env);
    const body = await c.req.json();

    const { email } = body;

    if (!email) {
      return c.json({ error: 'Email required' }, 400);
    }

    // Find user
    const user = await db.prepare(
      'SELECT id, email, name FROM users WHERE email = ? AND is_active = 1'
    ).bind(email.toLowerCase()).first();

    // Always return success to prevent email enumeration
    if (!user) {
      return c.json({ message: 'If the email exists, a reset link will be sent' });
    }

    // Generate reset token
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const resetToken = Array.from(tokenBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const tokenHash = await hashToken(resetToken);

    // Token expires in 1 hour
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    // Store reset token
    const tokenId = generateId();
    await db.prepare(`
      INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind(tokenId, user.id, tokenHash, expiresAt).run();

    // Send password reset email
    // Determine base URL from request or environment
    const baseUrl = c.env.APP_URL ||
                    c.req.header('origin') ||
                    `https://${c.req.header('host')}`;

    const emailResult = await sendPasswordResetEmail(
      c.env,
      user.email,
      user.name,
      resetToken,
      baseUrl
    );

    if (!emailResult.success) {
      console.error('Failed to send password reset email:', emailResult.error);
      // Don't expose email failure to user (security)
    }

    return c.json({
      message: 'If the email exists, a reset link will be sent'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return c.json({ error: 'Password reset request failed' }, 500);
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password using token
 * 
 * Body: {
 *   token: string,
 *   password: string
 * }
 */
authRouter.post('/reset-password', async (c) => {
  try {
    const db = getDB(c.env);
    const body = await c.req.json();

    const { token, password } = body;

    if (!token || !password) {
      return c.json({ error: 'Token and password required' }, 400);
    }

    // Validate password strength
    if (password.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters' }, 400);
    }

    // Find reset token
    const tokenHash = await hashToken(token);
    const resetToken = await db.prepare(`
      SELECT * FROM password_reset_tokens 
      WHERE token_hash = ? AND used_at IS NULL
    `).bind(tokenHash).first();

    if (!resetToken) {
      return c.json({ error: 'Invalid or expired reset token' }, 400);
    }

    // Check if token is expired
    if (new Date(resetToken.expires_at) < new Date()) {
      return c.json({ error: 'Reset token has expired' }, 400);
    }

    // Hash new password
    const passwordHash = await hashPassword(password);

    // Update password and mark token as used
    await db.batch([
      db.prepare(
        'UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?'
      ).bind(passwordHash, resetToken.user_id),

      db.prepare(
        'UPDATE password_reset_tokens SET used_at = datetime("now") WHERE id = ?'
      ).bind(resetToken.id),

      // Revoke all refresh tokens for this user (force re-login)
      db.prepare(
        'UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE user_id = ? AND revoked_at IS NULL'
      ).bind(resetToken.user_id)
    ]);

    return c.json({ message: 'Password reset successful' });

  } catch (error) {
    console.error('Reset password error:', error);
    return c.json({ error: 'Password reset failed' }, 500);
  }
});

/**
 * GET /api/auth/me
 * Get current user info (requires authentication)
 */
authRouter.get('/me', async (c) => {
  try {
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const db = getDB(c.env);

    // Get full user and organization details
    const fullUser = await db.prepare(`
      SELECT u.id, u.email, u.name, u.role, u.last_login_at, u.created_at,
             o.id as org_id, o.name as org_name, o.slug as org_slug, 
             o.subscription_tier, o.max_students, o.max_teachers
      FROM users u
      INNER JOIN organizations o ON u.organization_id = o.id
      WHERE u.id = ?
    `).bind(user.sub).first();

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
        createdAt: fullUser.created_at
      },
      organization: {
        id: fullUser.org_id,
        name: fullUser.org_name,
        slug: fullUser.org_slug,
        subscriptionTier: fullUser.subscription_tier,
        maxStudents: fullUser.max_students,
        maxTeachers: fullUser.max_teachers
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    return c.json({ error: 'Failed to get user info' }, 500);
  }
});

/**
 * PUT /api/auth/password
 * Change password (requires authentication)
 * 
 * Body: {
 *   currentPassword: string,
 *   newPassword: string
 * }
 */
authRouter.put('/password', async (c) => {
  try {
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const db = getDB(c.env);
    const body = await c.req.json();

    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return c.json({ error: 'Current and new password required' }, 400);
    }

    // Validate new password strength
    if (newPassword.length < 8) {
      return c.json({ error: 'New password must be at least 8 characters' }, 400);
    }

    // Get current password hash
    const dbUser = await db.prepare(
      'SELECT password_hash FROM users WHERE id = ?'
    ).bind(user.sub).first();

    if (!dbUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Verify current password (supports both old and new iteration counts)
    const passwordResult = await verifyPassword(currentPassword, dbUser.password_hash);
    if (!passwordResult.valid) {
      return c.json({ error: 'Current password is incorrect' }, 401);
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password and revoke all existing refresh tokens (force re-login on other devices)
    await db.batch([
      db.prepare(
        'UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?'
      ).bind(newPasswordHash, user.sub),

      // Revoke all refresh tokens for this user (security: invalidate existing sessions)
      db.prepare(
        'UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE user_id = ? AND revoked_at IS NULL'
      ).bind(user.sub)
    ]);

    return c.json({ message: 'Password changed successfully' });

  } catch (error) {
    console.error('Change password error:', error);
    return c.json({ error: 'Password change failed' }, 500);
  }
});
