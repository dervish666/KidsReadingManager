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
  verifyAccessToken,
  verifyRefreshToken,
  createJWTPayload,
  hashToken
} from '../utils/crypto.js';

export const authRouter = new Hono();

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

    return c.json({
      message: 'Registration successful',
      accessToken,
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

    // Find user by email
    const user = await db.prepare(`
      SELECT u.*, o.name as org_name, o.slug as org_slug, o.is_active as org_active
      FROM users u
      INNER JOIN organizations o ON u.organization_id = o.id
      WHERE u.email = ?
    `).bind(email.toLowerCase()).first();

    if (!user) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    // Check if user is active
    if (!user.is_active) {
      return c.json({ error: 'Account is deactivated' }, 403);
    }

    // Check if organization is active
    if (!user.org_active) {
      return c.json({ error: 'Organization is inactive' }, 403);
    }

    // Verify password
    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      return c.json({ error: 'Invalid email or password' }, 401);
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

    return c.json({
      accessToken,
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
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 * 
 * Body: {
 *   refreshToken: string
 * }
 */
authRouter.post('/refresh', async (c) => {
  try {
    const db = getDB(c.env);
    const body = await c.req.json();

    const { refreshToken } = body;

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

    return c.json({
      accessToken,
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
 * Revoke refresh token
 * 
 * Body: {
 *   refreshToken: string
 * }
 */
authRouter.post('/logout', async (c) => {
  try {
    const db = getDB(c.env);
    const body = await c.req.json();

    const { refreshToken } = body;

    if (refreshToken) {
      const tokenHash = await hashToken(refreshToken);
      await db.prepare(
        'UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE token_hash = ?'
      ).bind(tokenHash).run();
    }

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

    // TODO: Send email with reset link
    // For now, log the token (in production, this would be sent via email)
    console.log(`Password reset token for ${email}: ${resetToken}`);

    return c.json({ 
      message: 'If the email exists, a reset link will be sent',
      // In development, include the token for testing
      ...(c.env.ENVIRONMENT === 'development' && { resetToken })
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

    // Verify current password
    const passwordValid = await verifyPassword(currentPassword, dbUser.password_hash);
    if (!passwordValid) {
      return c.json({ error: 'Current password is incorrect' }, 401);
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    await db.prepare(
      'UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?'
    ).bind(newPasswordHash, user.sub).run();

    return c.json({ message: 'Password changed successfully' });

  } catch (error) {
    console.error('Change password error:', error);
    return c.json({ error: 'Password change failed' }, 500);
  }
});
