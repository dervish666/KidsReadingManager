/**
 * User Management Routes
 * Handles CRUD operations for users within an organization
 */

import { Hono } from 'hono';
import { generateId, csvRow } from '../utils/helpers.js';
import { hashPassword, generateTemporaryPassword, ROLES, hasPermission } from '../utils/crypto.js';
import { requireAdmin, requireOwner, auditLog } from '../middleware/tenant.js';
import { sendWelcomeEmail } from '../utils/email.js';
import { requireDB as getDB } from '../utils/routeHelpers.js';
import { rowToUser } from '../utils/rowMappers.js';
import {
  notFoundError,
  badRequestError,
  forbiddenError,
  createError,
} from '../middleware/errorHandler.js';

export const usersRouter = new Hono();

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
    const targetUserId = c.req.param('id');

    // Check if user exists and belongs to organization
    const existingUser = await db
      .prepare(
        `
      SELECT * FROM users WHERE id = ? AND organization_id = ?
    `
      )
      .bind(targetUserId, organizationId)
      .first();

    if (!existingUser) {
      throw notFoundError('User not found');
    }

    // Can't delete yourself
    if (targetUserId === currentUserId) {
      throw badRequestError('Cannot delete your own account');
    }

    // Can't delete the owner
    if (existingUser.role === 'owner') {
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
 * DELETE /api/users/:id/erase
 * GDPR Article 17 — Hard delete a user and all associated data
 * Requires: admin role, { confirm: true } in request body
 */
usersRouter.delete('/:id/erase', requireAdmin(), auditLog('erase', 'user'), async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const currentUserId = c.get('userId');
    const targetUserId = c.req.param('id');

    const body = await c.req.json().catch(() => ({}));
    if (!body.confirm) {
      throw badRequestError('Erasure requires { "confirm": true } in request body');
    }

    // Fetch the user (include inactive — erasure applies regardless)
    const existingUser = await db
      .prepare(
        `
      SELECT id, role FROM users WHERE id = ? AND organization_id = ?
    `
      )
      .bind(targetUserId, organizationId)
      .first();

    if (!existingUser) {
      throw notFoundError('User not found');
    }

    // Cannot erase yourself
    if (targetUserId === currentUserId) {
      throw badRequestError('Cannot erase your own account');
    }

    // Cannot erase the owner
    if (existingUser.role === 'owner') {
      throw badRequestError('Cannot erase the organization owner');
    }

    // Count records for response summary
    const tokenCount = await db
      .prepare('SELECT COUNT(*) as count FROM refresh_tokens WHERE user_id = ?')
      .bind(targetUserId)
      .first();

    // Log the erasure request BEFORE deleting
    const rightsLogId = generateId();

    await db.batch([
      db
        .prepare(
          `
        INSERT INTO data_rights_log (id, organization_id, request_type, subject_type, subject_id, requested_by, status, completed_at)
        VALUES (?, ?, 'erasure', 'user', ?, ?, 'completed', datetime('now'))
      `
        )
        .bind(rightsLogId, organizationId, targetUserId, currentUserId),

      // Delete in FK order: tokens → password resets → user
      db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').bind(targetUserId),
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(targetUserId),
      db.prepare('DELETE FROM users WHERE id = ?').bind(targetUserId),

      // Anonymise audit log entries that reference this user
      db
        .prepare(
          `
        UPDATE audit_log SET entity_id = 'erased', details = NULL
        WHERE entity_type = 'user' AND entity_id = ? AND organization_id = ?
      `
        )
        .bind(targetUserId, organizationId),
    ]);

    return c.json({
      message: 'User data erased successfully',
      erased: {
        refreshTokens: tokenCount.count,
        userRecord: 1,
        auditEntriesAnonymised: true,
      },
    });
  } catch (error) {
    if (error.status) throw error;
    console.error('Erase user error:', error);
    return c.json({ error: 'Failed to erase user' }, 500);
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

/**
 * GET /api/users/:id/export
 * GDPR Article 15 — Subject Access Request export for staff/users
 * Returns all personal data held on a user in JSON or CSV format
 * Requires: owner role
 */
usersRouter.get('/:id/export', requireOwner(), async (c) => {
  try {
    const db = getDB(c.env);
    const targetUserId = c.req.param('id');
    const currentUserId = c.get('userId');
    const format = (c.req.query('format') || 'json').toLowerCase();

    if (!['json', 'csv'].includes(format)) {
      throw badRequestError('Unsupported format. Use ?format=json or ?format=csv');
    }

    // Fetch user with organization name
    const user = await db
      .prepare(
        `
      SELECT u.*, o.name as organization_name
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      WHERE u.id = ?
    `
      )
      .bind(targetUserId)
      .first();

    if (!user) {
      throw notFoundError('User not found');
    }

    // Fetch audit log entries referencing this user (scoped to their organization)
    const auditEntries = await db
      .prepare(
        `
      SELECT action, entity_type, entity_id, details, created_at
      FROM audit_log
      WHERE (user_id = ? OR (entity_type = 'user' AND entity_id = ?))
        AND organization_id = ?
      ORDER BY created_at DESC
    `
      )
      .bind(targetUserId, targetUserId, user.organization_id)
      .all();

    // Log the SAR in data_rights_log
    await db
      .prepare(
        `
      INSERT INTO data_rights_log (id, organization_id, request_type, subject_type, subject_id, requested_by, status, completed_at)
      VALUES (?, ?, 'access', 'user', ?, ?, 'completed', datetime('now'))
    `
      )
      .bind(generateId(), user.organization_id, targetUserId, currentUserId)
      .run();

    const exportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        exportFormat: 'GDPR Article 15 Subject Access Request',
        organization: user.organization_name || user.organization_id,
        dataController: 'Scratch IT LTD',
      },
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        organization: user.organization_name,
        authProvider: user.auth_provider || 'local',
        isActive: Boolean(user.is_active),
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
      auditTrail: (auditEntries.results || []).map((a) => ({
        action: a.action,
        entityType: a.entity_type,
        entityId: a.entity_id,
        details: a.details || null,
        timestamp: a.created_at,
      })),
    };

    if (format === 'csv') {
      const lines = [];
      lines.push(`# GDPR Article 15 Subject Access Request`);
      lines.push(`# Export Date: ${exportData.metadata.exportDate}`);
      lines.push(`# Organization: ${exportData.metadata.organization}`);
      lines.push(`# Data Controller: ${exportData.metadata.dataController}`);
      lines.push('');

      lines.push('## User Profile');
      lines.push('Name,Email,Role,Organization,Auth Provider,Active,Last Login,Created,Updated');
      const u = exportData.user;
      lines.push(
        csvRow([
          u.name,
          u.email,
          u.role,
          u.organization,
          u.authProvider,
          u.isActive,
          u.lastLoginAt,
          u.createdAt,
          u.updatedAt,
        ])
      );
      lines.push('');

      if (exportData.auditTrail.length > 0) {
        lines.push('## Audit Trail');
        lines.push('Action,Entity Type,Entity ID,Details,Timestamp');
        for (const a of exportData.auditTrail) {
          lines.push(csvRow([a.action, a.entityType, a.entityId, a.details, a.timestamp]));
        }
      }

      const csv = lines.join('\n');
      const filename = `user-export-${user.name.replace(/[^a-zA-Z0-9]/g, '_')}-${new Date().toISOString().split('T')[0]}.csv`;

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // JSON format (default)
    const filename = `user-export-${user.name.replace(/[^a-zA-Z0-9]/g, '_')}-${new Date().toISOString().split('T')[0]}.json`;
    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error.status) throw error;
    console.error('Export user error:', error);
    return c.json({ error: 'Failed to export user data' }, 500);
  }
});

/**
 * GET /api/users/:id/classes
 * Get class assignments for a user (from class_assignments table) plus
 * the list of available classes in the user's organization for editing.
 * Requires: admin role
 */
usersRouter.get('/:id/classes', requireAdmin(), async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userRole = c.get('userRole');
    const targetUserId = c.req.param('id');

    // Fetch user - owners can see any user, admins only their org
    let user;
    if (userRole === ROLES.OWNER) {
      user = await db
        .prepare(
          'SELECT id, organization_id, wonde_employee_id FROM users WHERE id = ? AND is_active = 1'
        )
        .bind(targetUserId)
        .first();
    } else {
      user = await db
        .prepare(
          'SELECT id, organization_id, wonde_employee_id FROM users WHERE id = ? AND organization_id = ? AND is_active = 1'
        )
        .bind(targetUserId, organizationId)
        .first();
    }

    if (!user) {
      throw notFoundError('User not found');
    }

    // Assigned classes from class_assignments (the source of truth used at login)
    const assigned = await db
      .prepare(
        `
      SELECT c.id as class_id, c.name as class_name
      FROM class_assignments ca
      JOIN classes c ON c.id = ca.class_id
      WHERE ca.user_id = ? AND c.organization_id = ? AND c.is_active = 1
      ORDER BY c.name
    `
      )
      .bind(targetUserId, user.organization_id)
      .all();

    // All active classes in the user's organization (for picker)
    const available = await db
      .prepare(
        `
      SELECT id as class_id, name as class_name
      FROM classes
      WHERE organization_id = ? AND is_active = 1
      ORDER BY name
    `
      )
      .bind(user.organization_id)
      .all();

    const classes = (assigned.results || []).map((row) => ({
      classId: row.class_id,
      className: row.class_name,
      source: user.wonde_employee_id ? 'wonde' : 'manual',
    }));

    const availableClasses = (available.results || []).map((row) => ({
      classId: row.class_id,
      className: row.class_name,
    }));

    return c.json({
      classes,
      availableClasses,
      isWondeUser: Boolean(user.wonde_employee_id),
    });
  } catch (error) {
    if (error.status) throw error;
    console.error('Get user classes error:', error);
    return c.json({ error: 'Failed to get user classes' }, 500);
  }
});

/**
 * PUT /api/users/:id/classes
 * Replace the user's class assignments.
 * Body: { classIds: string[] }
 *
 * Note: For Wonde-synced users, the next Wonde sync will overwrite these
 * assignments based on the MIS data. For manual schools, these persist.
 *
 * Requires: admin role
 */
usersRouter.put('/:id/classes', requireAdmin(), auditLog('update', 'user'), async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userRole = c.get('userRole');
    const targetUserId = c.req.param('id');

    const body = await c.req.json().catch(() => ({}));
    const classIds = Array.isArray(body.classIds) ? body.classIds : null;

    if (classIds === null) {
      throw badRequestError('classIds (array) is required');
    }

    // Fetch user - owners can see any user, admins only their org
    let user;
    if (userRole === ROLES.OWNER) {
      user = await db
        .prepare('SELECT id, organization_id FROM users WHERE id = ? AND is_active = 1')
        .bind(targetUserId)
        .first();
    } else {
      user = await db
        .prepare(
          'SELECT id, organization_id FROM users WHERE id = ? AND organization_id = ? AND is_active = 1'
        )
        .bind(targetUserId, organizationId)
        .first();
    }

    if (!user) {
      throw notFoundError('User not found');
    }

    // Validate all classIds belong to the user's org and are active
    if (classIds.length > 0) {
      const placeholders = classIds.map(() => '?').join(',');
      const validClasses = await db
        .prepare(
          `SELECT id FROM classes
           WHERE organization_id = ? AND is_active = 1 AND id IN (${placeholders})`
        )
        .bind(user.organization_id, ...classIds)
        .all();

      const validIds = new Set((validClasses.results || []).map((r) => r.id));
      const invalid = classIds.filter((id) => !validIds.has(id));
      if (invalid.length > 0) {
        throw badRequestError(
          `Invalid class IDs (not in user's organization or inactive): ${invalid.join(', ')}`
        );
      }
    }

    // Replace assignments atomically
    const statements = [
      db.prepare('DELETE FROM class_assignments WHERE user_id = ?').bind(targetUserId),
    ];
    for (const classId of classIds) {
      statements.push(
        db
          .prepare(
            'INSERT OR IGNORE INTO class_assignments (id, class_id, user_id, created_at) VALUES (?, ?, ?, datetime("now"))'
          )
          .bind(generateId(), classId, targetUserId)
      );
    }

    // Chunk batches to stay under D1's 100-statement limit
    for (let i = 0; i < statements.length; i += 100) {
      await db.batch(statements.slice(i, i + 100));
    }

    return c.json({
      message: 'Class assignments updated successfully',
      assignedCount: classIds.length,
    });
  } catch (error) {
    if (error.status) throw error;
    console.error('Update user classes error:', error);
    return c.json({ error: 'Failed to update class assignments' }, 500);
  }
});
