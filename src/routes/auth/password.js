/**
 * Password management routes.
 *
 *   POST /forgot-password  — request a reset email (enumeration-safe)
 *   POST /reset-password   — set a new password from a reset token
 *   PUT  /password         — change password (requires authentication), and
 *                            re-issue this device's session so the person who
 *                            just changed it is not the one signed out
 */

import { Hono } from 'hono';
import { generateId } from '../../utils/helpers.js';
import { validatePassword } from '../../utils/validation.js';
import {
  hashPassword,
  verifyPassword,
  hashToken,
  createAccessToken,
  createRefreshToken,
  createJWTPayload,
  buildRefreshCookie,
} from '../../utils/crypto.js';
import { sendPasswordResetEmail } from '../../utils/email.js';
import { isPlaceholderEmail } from '../../utils/username.js';
import { requireDB as getDB } from '../../utils/routeHelpers.js';

export const passwordRouter = new Hono();

/**
 * POST /api/auth/forgot-password
 * Request password reset email
 *
 * Body: {
 *   email: string
 * }
 */
passwordRouter.post('/forgot-password', async (c) => {
  try {
    const db = getDB(c.env);
    const body = await c.req.json();

    const { email } = body;

    if (!email) {
      return c.json({ error: 'Email required' }, 400);
    }

    // Find user
    const user = await db
      .prepare('SELECT id, email, name FROM users WHERE email = ? AND is_active = 1')
      .bind(email.toLowerCase())
      .first();

    // Always return success to prevent email enumeration.
    // A manually created account's address is a placeholder, not an inbox — it
    // gets the same answer as an unknown address rather than a reset token
    // nobody can ever receive. Their recovery path is an admin reset.
    if (!user || isPlaceholderEmail(user.email)) {
      return c.json({ message: 'If the email exists, a reset link will be sent' });
    }

    // Generate reset token
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const resetToken = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const tokenHash = await hashToken(resetToken);

    // Token expires in 1 hour
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    // Invalidate any existing unused reset tokens for this user
    await db
      .prepare(
        `
      UPDATE password_reset_tokens SET used_at = datetime('now')
      WHERE user_id = ? AND used_at IS NULL
    `
      )
      .bind(user.id)
      .run();

    // Store new reset token
    const tokenId = generateId();
    await db
      .prepare(
        `
      INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `
      )
      .bind(tokenId, user.id, tokenHash, expiresAt)
      .run();

    // Send password reset email
    const baseUrl = c.env.APP_URL;
    if (!baseUrl) {
      console.error(
        'APP_URL environment variable not configured - cannot send password reset email'
      );
      // Still return success to prevent email enumeration
      return c.json({ message: 'If the email exists, a reset link will be sent' });
    }

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
      message: 'If the email exists, a reset link will be sent',
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
passwordRouter.post('/reset-password', async (c) => {
  try {
    const db = getDB(c.env);
    const body = await c.req.json();

    const { token, password } = body;

    if (!token || !password) {
      return c.json({ error: 'Token and password required' }, 400);
    }

    // Validate password strength
    const pwCheck = validatePassword(password);
    if (!pwCheck.isValid) {
      return c.json({ error: pwCheck.error }, 400);
    }

    // Find reset token
    const tokenHash = await hashToken(token);
    const resetToken = await db
      .prepare(
        `
      SELECT * FROM password_reset_tokens
      WHERE token_hash = ? AND used_at IS NULL
    `
      )
      .bind(tokenHash)
      .first();

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
      db
        .prepare('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?')
        .bind(passwordHash, resetToken.user_id),

      db
        .prepare('UPDATE password_reset_tokens SET used_at = datetime("now") WHERE id = ?')
        .bind(resetToken.id),

      // Revoke all refresh tokens for this user (force re-login)
      db
        .prepare(
          'UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE user_id = ? AND revoked_at IS NULL'
        )
        .bind(resetToken.user_id),
    ]);

    return c.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    return c.json({ error: 'Password reset failed' }, 500);
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
passwordRouter.put('/password', async (c) => {
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
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.isValid) {
      return c.json({ error: pwCheck.error }, 400);
    }

    // Get current password hash
    const dbUser = await db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .bind(user.sub)
      .first();

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

    // Update password and revoke every existing refresh token, so a session
    // opened with the old password (a shared classroom laptop, a lost phone)
    // cannot outlive it.
    await db.batch([
      db
        .prepare('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?')
        .bind(newPasswordHash, user.sub),

      // Revoke all refresh tokens for this user (security: invalidate existing sessions)
      db
        .prepare(
          'UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE user_id = ? AND revoked_at IS NULL'
        )
        .bind(user.sub),
    ]);

    // That revocation includes the caller's own token, so without this the
    // person who just changed their password is signed out within 15 minutes
    // and cannot say why. Issue this device a fresh session; every other
    // device stays revoked. A failure here is not a failed password change —
    // say so, and let them sign in again with the new password.
    const jwtSecret = c.env.JWT_SECRET;
    try {
      if (!jwtSecret) throw new Error('JWT_SECRET not configured');

      const fullUser = await db
        .prepare(
          `SELECT u.id, u.email, u.username, u.name, u.role, u.auth_provider, u.organization_id,
                  o.slug as org_slug
           FROM users u
           INNER JOIN organizations o ON u.organization_id = o.id
           WHERE u.id = ? AND u.is_active = 1 AND o.is_active = 1`
        )
        .bind(user.sub)
        .first();

      if (!fullUser) throw new Error('User not found after password change');

      let assignedClassIds = [];
      try {
        const assignments = await db
          .prepare('SELECT class_id FROM class_assignments WHERE user_id = ?')
          .bind(user.sub)
          .all();
        assignedClassIds = (assignments.results || []).map((r) => r.class_id);
      } catch {
        /* class_assignments may be empty or missing; the token is fine without it */
      }

      const payload = createJWTPayload(
        {
          id: fullUser.id,
          email: fullUser.email,
          name: fullUser.name,
          role: fullUser.role,
          authProvider: fullUser.auth_provider,
          assignedClassIds,
        },
        { id: fullUser.organization_id, slug: fullUser.org_slug }
      );

      const accessToken = await createAccessToken(payload, jwtSecret);
      const refreshTokenData = await createRefreshToken(fullUser.id, jwtSecret);

      await db
        .prepare(
          `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`
        )
        .bind(generateId(), fullUser.id, refreshTokenData.hash, refreshTokenData.expiresAt)
        .run();

      const isProduction = c.env.ENVIRONMENT !== 'development';
      c.header('Set-Cookie', buildRefreshCookie(refreshTokenData.token, isProduction));

      return c.json({
        message: 'Password changed successfully',
        accessToken,
        signedOutElsewhere: true,
      });
    } catch (reissueError) {
      console.error('Password changed but session re-issue failed:', reissueError);
      return c.json({
        message: 'Password changed successfully. Please sign in again with your new password.',
        reauthRequired: true,
      });
    }
  } catch (error) {
    console.error('Change password error:', error);
    return c.json({ error: 'Password change failed' }, 500);
  }
});
