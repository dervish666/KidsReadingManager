/**
 * Users entry router.
 *
 * The user surface area is split across files in `src/routes/users/`
 * for readability — GDPR and class-assignment endpoints each get their
 * own module. This file owns the core CRUD plus password reset, and
 * composes the sub-routers in.
 *
 * Order of mounting matters: the sub-routers carry the `/:id/erase`,
 * `/:id/export`, and `/:id/classes` paths that need to be matched
 * before this file's bare `/:id` handlers. Hono's trie prefers static
 * routes over params, but mounting sub-routers first keeps the
 * precedence explicit and trivially auditable.
 */

import { Hono } from 'hono';
import { generateId } from '../utils/helpers.js';
import { hashPassword, generateTemporaryPassword, ROLES, hasPermission } from '../utils/crypto.js';
import { requireAdmin, auditLog } from '../middleware/tenant.js';
import { sendWelcomeEmail } from '../utils/email.js';
import { requireDB as getDB } from '../utils/routeHelpers.js';
import { rowToUser } from '../utils/rowMappers.js';
import {
  notFoundError,
  badRequestError,
  forbiddenError,
  createError,
} from '../middleware/errorHandler.js';

import { gdprRouter } from './users/gdpr.js';
import { classesRouter } from './users/classes.js';

export const usersRouter = new Hono();

// Mount sub-routers first so their literal paths take precedence over the
// `/:id` core handlers below. The trie router would resolve this either way,
// but explicit ordering means a future maintainer doesn't have to reason
// about routing precedence.
usersRouter.route('/', gdprRouter);
usersRouter.route('/', classesRouter);

/**
 * GET /api/users
 * List all users in the organization
 * Requires: admin role
 */
usersRouter.get('/', requireAdmin(), async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userRole = c.get('userRole');

    let query;
    let params;

    // Owners can see users from all organizations, admins only from their own
    if (userRole === ROLES.OWNER) {
      query = `
        SELECT u.id, u.organization_id, o.name as organization_name, u.email, u.name, u.role,
               u.is_active, u.last_login_at, u.created_at, u.updated_at,
               u.auth_provider, u.mylogin_id, u.wonde_employee_id
        FROM users u
        LEFT JOIN organizations o ON u.organization_id = o.id
        WHERE u.is_active = 1
        ORDER BY o.name, u.name
      `;
      params = [];
    } else {
      query = `
        SELECT u.id, u.organization_id, o.name as organization_name, u.email, u.name, u.role,
               u.is_active, u.last_login_at, u.created_at, u.updated_at,
               u.auth_provider, u.mylogin_id, u.wonde_employee_id
        FROM users u
        LEFT JOIN organizations o ON u.organization_id = o.id
        WHERE u.organization_id = ? AND u.is_active = 1
        ORDER BY u.name
      `;
      params = [organizationId];
    }

    const result = await db
      .prepare(query)
      .bind(...params)
      .all();

    const users = (result.results || []).map(rowToUser);

    return c.json({ users });
  } catch (error) {
    console.error('List users error:', error);
    return c.json({ error: 'Failed to list users' }, 500);
  }
});

/**
 * GET /api/users/:id
 * Get a specific user
 * Requires: admin role (or self)
 */
usersRouter.get('/:id', async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userId = c.get('userId');
    const userRole = c.get('userRole');
    const requestedId = c.req.param('id');

    // Allow users to view their own profile, or admins to view any user
    if (requestedId !== userId && !hasPermission(userRole, ROLES.ADMIN)) {
      throw forbiddenError();
    }

    // Owners can view users in any organization
    let user;
    if (userRole === ROLES.OWNER) {
      user = await db
        .prepare(
          `
        SELECT id, organization_id, email, name, role, is_active, last_login_at, created_at, updated_at
        FROM users
        WHERE id = ? AND is_active = 1
      `
        )
        .bind(requestedId)
        .first();
    } else {
      user = await db
        .prepare(
          `
        SELECT id, organization_id, email, name, role, is_active, last_login_at, created_at, updated_at
        FROM users
        WHERE id = ? AND organization_id = ? AND is_active = 1
      `
        )
        .bind(requestedId, organizationId)
        .first();
    }

    if (!user) {
      throw notFoundError('User not found');
    }

    return c.json({ user: rowToUser(user) });
  } catch (error) {
    if (error.status) throw error;
    console.error('Get user error:', error);
    return c.json({ error: 'Failed to get user' }, 500);
  }
});

/**
 * POST /api/users
 * Create a new user (invite)
 * Requires: admin role
 *
 * Body: {
 *   email: string,
 *   name: string,
 *   role: 'admin' | 'teacher' | 'readonly',
 *   password?: string (optional, will generate if not provided)
 * }
 */
usersRouter.post('/', requireAdmin(), auditLog('create', 'user'), async (c) => {
  try {
    const db = getDB(c.env);
    const currentUserOrgId = c.get('organizationId');
    const currentUserRole = c.get('userRole');
    const body = await c.req.json();

    const { email, name, role, password, organizationId } = body;

    // Determine which organization to create user in
    // Owners can create users in any organization, admins only in their own
    let targetOrgId = organizationId || currentUserOrgId;

    // Only owners can create users in different organizations
    if (targetOrgId !== currentUserOrgId && currentUserRole !== ROLES.OWNER) {
      throw forbiddenError('Only owners can create users in other organizations');
    }

    // Validate required fields
    if (!email || !name || !role) {
      return c.json(
        {
          error: 'Missing required fields',
          required: ['email', 'name', 'role'],
        },
        400
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw badRequestError('Invalid email format');
    }

    // Validate role
    const validRoles = ['admin', 'teacher', 'readonly'];
    if (!validRoles.includes(role)) {
      return c.json(
        {
          error: 'Invalid role',
          validRoles,
        },
        400
      );
    }

    // Only owners can create admins
    if (role === 'admin' && currentUserRole !== ROLES.OWNER) {
      throw forbiddenError('Only owners can create admin users');
    }

    // Check if email already exists (among active users)
    const existingUser = await db
      .prepare('SELECT id FROM users WHERE email = ? AND is_active = 1')
      .bind(email.toLowerCase())
      .first();

    if (existingUser) {
      throw createError('Email already registered', 409);
    }

    // Fetch organization name for welcome email
    const org = await db
      .prepare('SELECT name FROM organizations WHERE id = ? AND is_active = 1')
      .bind(targetOrgId)
      .first();

    if (!org) {
      throw notFoundError('Organization not found');
    }

    // Generate password if not provided
    const userPassword = password || generateTemporaryPassword();
    const passwordHash = await hashPassword(userPassword);

    // Create user
    const userId = generateId();
    await db
      .prepare(
        `
      INSERT INTO users (id, organization_id, email, password_hash, name, role, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `
      )
      .bind(userId, targetOrgId, email.toLowerCase(), passwordHash, name, role)
      .run();

    // Send invitation email with temporary password
    // SECURITY: Never include temporary passwords in API responses
    // The password should only be sent via email to the user
    const baseUrl = c.env.APP_URL || c.req.header('origin') || `https://${c.req.header('host')}`;

    const emailResult = await sendWelcomeEmail(
      c.env,
      email.toLowerCase(),
      name,
      org.name,
      userPassword,
      baseUrl
    );

    if (!emailResult.success) {
      console.warn('Failed to send welcome email:', emailResult.error);
    }

    return c.json(
      {
        message: emailResult.success
          ? 'User created successfully. An invitation email has been sent.'
          : 'User created successfully. Note: invitation email could not be sent.',
        user: {
          id: userId,
          email: email.toLowerCase(),
          name,
          role,
          isActive: true,
        },
        emailSent: emailResult.success,
      },
      201
    );
  } catch (error) {
    if (error.status) throw error;
    console.error('Create user error:', error);
    return c.json({ error: 'Failed to create user' }, 500);
  }
});

/**
 * PUT /api/users/:id
 * Update a user
 * Requires: admin role (or self for limited fields)
 *
 * Body: {
 *   name?: string,
 *   role?: string (admin only),
 *   isActive?: boolean (admin only)
 * }
 */
usersRouter.put('/:id', auditLog('update', 'user'), async (c) => {
  try {
    const db = getDB(c.env);
    const currentUserOrgId = c.get('organizationId');
    const currentUserId = c.get('userId');
    const currentUserRole = c.get('userRole');
    const targetUserId = c.req.param('id');
    const body = await c.req.json();

    const { name, role, isActive, organizationId } = body;

    // Determine roles upfront
    const isSelf = targetUserId === currentUserId;
    const isAdmin = hasPermission(currentUserRole, ROLES.ADMIN);
    const isOwner = currentUserRole === ROLES.OWNER;

    // Check if user exists - owners can see any user, others must be same org
    let existingUser;
    if (isOwner) {
      existingUser = await db
        .prepare(
          `
        SELECT id, organization_id, email, name, role, is_active, last_login_at,
               created_at, updated_at, auth_provider, mylogin_id, wonde_employee_id
        FROM users WHERE id = ? AND is_active = 1
      `
        )
        .bind(targetUserId)
        .first();
    } else {
      existingUser = await db
        .prepare(
          `
        SELECT id, organization_id, email, name, role, is_active, last_login_at,
               created_at, updated_at, auth_provider, mylogin_id, wonde_employee_id
        FROM users WHERE id = ? AND organization_id = ? AND is_active = 1
      `
        )
        .bind(targetUserId, currentUserOrgId)
        .first();
    }

    if (!existingUser) {
      throw notFoundError('User not found');
    }

    // Self can only update name
    if (isSelf && !isAdmin) {
      if (role !== undefined || isActive !== undefined || organizationId !== undefined) {
        throw forbiddenError('You can only update your own name');
      }
    }

    // Non-admins can't update other users
    if (!isSelf && !isAdmin) {
      throw forbiddenError();
    }

    // Check if updating organization - only owners can move users
    if (organizationId !== undefined) {
      if (!isOwner) {
        throw forbiddenError('Only owners can move users between organizations');
      }

      // Validate organization exists
      const targetOrg = await db
        .prepare('SELECT * FROM organizations WHERE id = ? AND is_active = 1')
        .bind(organizationId)
        .first();

      if (!targetOrg) {
        throw notFoundError('Target organization not found');
      }
    }

    // Only owners can change roles to/from admin — but only when the role
    // is actually changing. The Edit User dialog echoes the current role in
    // every PUT, and an unchanged role shouldn't trip the guards below.
    if (role !== undefined && role !== existingUser.role) {
      if ((role === 'admin' || existingUser.role === 'admin') && !isOwner) {
        throw forbiddenError('Only owners can modify admin roles');
      }

      // Can't change owner role
      if (existingUser.role === 'owner') {
        throw forbiddenError('Cannot change owner role');
      }

      // Validate role
      const validRoles = ['admin', 'teacher', 'readonly'];
      if (!validRoles.includes(role)) {
        throw badRequestError('Invalid role');
      }
    }

    // Can't deactivate yourself
    if (isSelf && isActive === false) {
      throw badRequestError('Cannot deactivate your own account');
    }

    // Can't deactivate the owner
    if (existingUser.role === 'owner' && isActive === false) {
      throw badRequestError('Cannot deactivate the organization owner');
    }

    // Build update query
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }

    if (role !== undefined && role !== existingUser.role && isAdmin) {
      updates.push('role = ?');
      params.push(role);
    }

    if (isActive !== undefined && isAdmin) {
      updates.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }

    if (organizationId !== undefined && isOwner) {
      updates.push('organization_id = ?');
      params.push(organizationId);
    }

    if (updates.length === 0) {
      throw badRequestError('No valid fields to update');
    }

    updates.push('updated_at = datetime("now")');
    params.push(targetUserId);

    await db
      .prepare(
        `
      UPDATE users SET ${updates.join(', ')} WHERE id = ?
    `
      )
      .bind(...params)
      .run();

    // Get updated user with organization name
    const updatedUser = await db
      .prepare(
        `
      SELECT u.id, u.organization_id, o.name as organization_name, u.email, u.name, u.role,
             u.is_active, u.last_login_at, u.created_at, u.updated_at
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      WHERE u.id = ?
    `
      )
      .bind(targetUserId)
      .first();

    return c.json({
      message: 'User updated successfully',
      user: rowToUser(updatedUser),
    });
  } catch (error) {
    if (error.status) throw error;
    console.error('Update user error:', error);
    return c.json({ error: 'Failed to update user' }, 500);
  }
});

/**
 * DELETE /api/users/:id
 * Deactivate a user (soft delete)
 * Requires: admin role
 */
usersRouter.delete('/:id', requireAdmin(), auditLog('delete', 'user'), async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const currentUserId = c.get('userId');
    const currentUserRole = c.get('userRole');
    const targetUserId = c.req.param('id');

    // Owners can delete users from any organization; others only within their own.
    // We only need the role (to gate non-owner → owner deletes) and the org id
    // (for audit/logging). Reading password_hash via SELECT * risks leaking a
    // hash into a future cache or log line, so list columns explicitly.
    let existingUser;
    if (currentUserRole === ROLES.OWNER) {
      existingUser = await db
        .prepare('SELECT id, role, organization_id, email FROM users WHERE id = ?')
        .bind(targetUserId)
        .first();
    } else {
      existingUser = await db
        .prepare(
          'SELECT id, role, organization_id, email FROM users WHERE id = ? AND organization_id = ?'
        )
        .bind(targetUserId, organizationId)
        .first();
    }

    if (!existingUser) {
      throw notFoundError('User not found');
    }

    // Can't delete yourself
    if (targetUserId === currentUserId) {
      throw badRequestError('Cannot delete your own account');
    }

    // Non-owners can't delete owner-role users
    if (existingUser.role === 'owner' && currentUserRole !== ROLES.OWNER) {
      throw badRequestError('Cannot delete the organization owner');
    }

    // Soft delete (deactivate), revoke tokens, and clean up class assignments
    await db.batch([
      db
        .prepare(`UPDATE users SET is_active = 0, updated_at = datetime("now") WHERE id = ?`)
        .bind(targetUserId),
      db
        .prepare(
          `UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE user_id = ? AND revoked_at IS NULL`
        )
        .bind(targetUserId),
      db.prepare(`DELETE FROM class_assignments WHERE user_id = ?`).bind(targetUserId),
    ]);

    return c.json({ message: 'User deactivated successfully' });
  } catch (error) {
    if (error.status) throw error;
    console.error('Delete user error:', error);
    return c.json({ error: 'Failed to delete user' }, 500);
  }
});

/**
 * POST /api/users/:id/reset-password
 * Reset a user's password (admin action)
 * Requires: admin role
 */
usersRouter.post('/:id/reset-password', requireAdmin(), auditLog('update', 'user'), async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const targetUserId = c.req.param('id');

    // Check if user exists and belongs to organization, include org name for email
    const existingUser = await db
      .prepare(
        `
      SELECT u.*, o.name as organization_name
      FROM users u
      JOIN organizations o ON u.organization_id = o.id
      WHERE u.id = ? AND u.organization_id = ?
    `
      )
      .bind(targetUserId, organizationId)
      .first();

    if (!existingUser) {
      throw notFoundError('User not found');
    }

    // Only owners can reset owner passwords — otherwise a compromised admin
    // account could trigger a reset email for the owner and pair it with an
    // email-interception vector (shared school inbox, forwarding rule) for
    // full takeover.
    const currentUserRole = c.get('userRole');
    if (existingUser.role === 'owner' && currentUserRole !== 'owner') {
      throw forbiddenError('Cannot reset owner password');
    }

    // Generate new temporary password
    const newPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(newPassword);

    // Update password
    await db
      .prepare(
        `
      UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?
    `
      )
      .bind(passwordHash, targetUserId)
      .run();

    // Revoke all refresh tokens (force re-login)
    await db
      .prepare(
        `
      UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE user_id = ? AND revoked_at IS NULL
    `
      )
      .bind(targetUserId)
      .run();

    // Send email with new password
    // SECURITY: Never include passwords in API responses
    // The password should only be sent via email to the user
    const baseUrl = c.env.APP_URL || c.req.header('origin') || `https://${c.req.header('host')}`;

    const emailResult = await sendWelcomeEmail(
      c.env,
      existingUser.email,
      existingUser.name,
      existingUser.organization_name,
      newPassword,
      baseUrl
    );

    if (!emailResult.success) {
      console.warn('Failed to send password reset email:', emailResult.error);
    }

    return c.json({
      message: emailResult.success
        ? 'Password reset successfully. The new password has been sent via email.'
        : 'Password reset successfully. Note: email notification could not be sent.',
      emailSent: emailResult.success,
    });
  } catch (error) {
    if (error.status) throw error;
    console.error('Reset password error:', error);
    return c.json({ error: 'Failed to reset password' }, 500);
  }
});
