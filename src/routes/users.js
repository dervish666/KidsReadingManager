/**
 * User Management Routes
 * Handles CRUD operations for users within an organization
 */

import { Hono } from 'hono';
import { generateId } from '../utils/helpers.js';
import { hashPassword, generateTemporaryPassword, ROLES, hasPermission } from '../utils/crypto.js';
import { requireAdmin, requireOwner, auditLog } from '../middleware/tenant.js';
import { sendWelcomeEmail } from '../utils/email.js';
import { requireDB as getDB } from '../utils/routeHelpers.js';
import { rowToUser } from '../utils/rowMappers.js';

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
        WHERE u.organization_id = ?
        ORDER BY u.name
      `;
      params = [organizationId];
    }

    const result = await db.prepare(query).bind(...params).all();

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
      return c.json({ error: 'Forbidden' }, 403);
    }

    const user = await db.prepare(`
      SELECT id, organization_id, email, name, role, is_active, last_login_at, created_at, updated_at
      FROM users
      WHERE id = ? AND organization_id = ? AND is_active = 1
    `).bind(requestedId, organizationId).first();

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ user: rowToUser(user) });

  } catch (error) {
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
      return c.json({ error: 'Only owners can create users in other organizations' }, 403);
    }

    // Validate required fields
    if (!email || !name || !role) {
      return c.json({ 
        error: 'Missing required fields',
        required: ['email', 'name', 'role']
      }, 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return c.json({ error: 'Invalid email format' }, 400);
    }

    // Validate role
    const validRoles = ['admin', 'teacher', 'readonly'];
    if (!validRoles.includes(role)) {
      return c.json({ 
        error: 'Invalid role',
        validRoles
      }, 400);
    }

    // Only owners can create admins
    if (role === 'admin' && currentUserRole !== ROLES.OWNER) {
      return c.json({ error: 'Only owners can create admin users' }, 403);
    }

    // Check if email already exists (among active users)
    const existingUser = await db.prepare(
      'SELECT id FROM users WHERE email = ? AND is_active = 1'
    ).bind(email.toLowerCase()).first();

    if (existingUser) {
      return c.json({ error: 'Email already registered' }, 409);
    }

    // Check organization limits
    const org = await db.prepare(
      'SELECT name, max_teachers FROM organizations WHERE id = ?'
    ).bind(targetOrgId).first();

    if (!org) {
      return c.json({ error: 'Organization not found' }, 404);
    }

    const userCount = await db.prepare(
      'SELECT COUNT(*) as count FROM users WHERE organization_id = ? AND is_active = 1'
    ).bind(targetOrgId).first();

    if (userCount.count >= org.max_teachers) {
      return c.json({ 
        error: 'Organization has reached maximum user limit',
        limit: org.max_teachers
      }, 403);
    }

    // Generate password if not provided
    const userPassword = password || generateTemporaryPassword();
    const passwordHash = await hashPassword(userPassword);

    // Create user
    const userId = generateId();
    await db.prepare(`
      INSERT INTO users (id, organization_id, email, password_hash, name, role, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).bind(userId, targetOrgId, email.toLowerCase(), passwordHash, name, role).run();

    // Send invitation email with temporary password
    // SECURITY: Never include temporary passwords in API responses
    // The password should only be sent via email to the user
    const baseUrl = c.env.APP_URL ||
                    c.req.header('origin') ||
                    `https://${c.req.header('host')}`;

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

    return c.json({
      message: emailResult.success
        ? 'User created successfully. An invitation email has been sent.'
        : 'User created successfully. Note: invitation email could not be sent.',
      user: {
        id: userId,
        email: email.toLowerCase(),
        name,
        role,
        isActive: true
      },
      emailSent: emailResult.success
    }, 201);

  } catch (error) {
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
      existingUser = await db.prepare(`
        SELECT * FROM users WHERE id = ? AND is_active = 1
      `).bind(targetUserId).first();
    } else {
      existingUser = await db.prepare(`
        SELECT * FROM users WHERE id = ? AND organization_id = ? AND is_active = 1
      `).bind(targetUserId, currentUserOrgId).first();
    }

    if (!existingUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Self can only update name
    if (isSelf && !isAdmin) {
      if (role !== undefined || isActive !== undefined || organizationId !== undefined) {
        return c.json({ error: 'You can only update your own name' }, 403);
      }
    }

    // Non-admins can't update other users
    if (!isSelf && !isAdmin) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    // Check if updating organization - only owners can move users
    if (organizationId !== undefined) {
      if (!isOwner) {
        return c.json({ error: 'Only owners can move users between organizations' }, 403);
      }

      // Validate organization exists
      const targetOrg = await db.prepare(
        'SELECT * FROM organizations WHERE id = ? AND is_active = 1'
      ).bind(organizationId).first();

      if (!targetOrg) {
        return c.json({ error: 'Target organization not found' }, 404);
      }

      // Check target organization limits
      const userCount = await db.prepare(
        'SELECT COUNT(*) as count FROM users WHERE organization_id = ? AND is_active = 1'
      ).bind(organizationId).first();

      if (userCount.count >= targetOrg.max_teachers) {
        return c.json({
          error: 'Target organization has reached maximum user limit',
          limit: targetOrg.max_teachers
        }, 403);
      }
    }

    // Only owners can change roles to/from admin
    if (role !== undefined) {
      if ((role === 'admin' || existingUser.role === 'admin') && !isOwner) {
        return c.json({ error: 'Only owners can modify admin roles' }, 403);
      }

      // Can't change owner role
      if (existingUser.role === 'owner') {
        return c.json({ error: 'Cannot change owner role' }, 403);
      }

      // Validate role
      const validRoles = ['admin', 'teacher', 'readonly'];
      if (!validRoles.includes(role)) {
        return c.json({ error: 'Invalid role' }, 400);
      }
    }

    // Can't deactivate yourself
    if (isSelf && isActive === false) {
      return c.json({ error: 'Cannot deactivate your own account' }, 400);
    }

    // Can't deactivate the owner
    if (existingUser.role === 'owner' && isActive === false) {
      return c.json({ error: 'Cannot deactivate the organization owner' }, 400);
    }

    // Build update query
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }

    if (role !== undefined && isAdmin) {
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
      return c.json({ error: 'No valid fields to update' }, 400);
    }

    updates.push('updated_at = datetime("now")');
    params.push(targetUserId);

    await db.prepare(`
      UPDATE users SET ${updates.join(', ')} WHERE id = ?
    `).bind(...params).run();

    // Get updated user with organization name
    const updatedUser = await db.prepare(`
      SELECT u.id, u.organization_id, o.name as organization_name, u.email, u.name, u.role,
             u.is_active, u.last_login_at, u.created_at, u.updated_at
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      WHERE u.id = ?
    `).bind(targetUserId).first();

    return c.json({
      message: 'User updated successfully',
      user: rowToUser(updatedUser)
    });

  } catch (error) {
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
    const existingUser = await db.prepare(`
      SELECT * FROM users WHERE id = ? AND organization_id = ?
    `).bind(targetUserId, organizationId).first();

    if (!existingUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Can't delete yourself
    if (targetUserId === currentUserId) {
      return c.json({ error: 'Cannot delete your own account' }, 400);
    }

    // Can't delete the owner
    if (existingUser.role === 'owner') {
      return c.json({ error: 'Cannot delete the organization owner' }, 400);
    }

    // Soft delete (deactivate)
    await db.prepare(`
      UPDATE users SET is_active = 0, updated_at = datetime("now") WHERE id = ?
    `).bind(targetUserId).run();

    // Revoke all refresh tokens
    await db.prepare(`
      UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE user_id = ? AND revoked_at IS NULL
    `).bind(targetUserId).run();

    return c.json({ message: 'User deactivated successfully' });

  } catch (error) {
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
      return c.json({ error: 'Erasure requires { "confirm": true } in request body' }, 400);
    }

    // Fetch the user (include inactive — erasure applies regardless)
    const existingUser = await db.prepare(`
      SELECT id, role FROM users WHERE id = ? AND organization_id = ?
    `).bind(targetUserId, organizationId).first();

    if (!existingUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Cannot erase yourself
    if (targetUserId === currentUserId) {
      return c.json({ error: 'Cannot erase your own account' }, 400);
    }

    // Cannot erase the owner
    if (existingUser.role === 'owner') {
      return c.json({ error: 'Cannot erase the organization owner' }, 400);
    }

    // Count records for response summary
    const tokenCount = await db.prepare(
      'SELECT COUNT(*) as count FROM refresh_tokens WHERE user_id = ?'
    ).bind(targetUserId).first();

    // Log the erasure request BEFORE deleting
    const rightsLogId = generateId();

    await db.batch([
      db.prepare(`
        INSERT INTO data_rights_log (id, organization_id, request_type, subject_type, subject_id, requested_by, status, completed_at)
        VALUES (?, ?, 'erasure', 'user', ?, ?, 'completed', datetime('now'))
      `).bind(rightsLogId, organizationId, targetUserId, currentUserId),

      // Delete in FK order: tokens → password resets → user
      db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').bind(targetUserId),
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(targetUserId),
      db.prepare('DELETE FROM users WHERE id = ?').bind(targetUserId),

      // Anonymise audit log entries that reference this user
      db.prepare(`
        UPDATE audit_log SET entity_id = 'erased', details = NULL
        WHERE entity_type = 'user' AND entity_id = ? AND organization_id = ?
      `).bind(targetUserId, organizationId),
    ]);

    return c.json({
      message: 'User data erased successfully',
      erased: {
        refreshTokens: tokenCount.count,
        userRecord: 1,
        auditEntriesAnonymised: true
      }
    });

  } catch (error) {
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
    const existingUser = await db.prepare(`
      SELECT u.*, o.name as organization_name
      FROM users u
      JOIN organizations o ON u.organization_id = o.id
      WHERE u.id = ? AND u.organization_id = ?
    `).bind(targetUserId, organizationId).first();

    if (!existingUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Generate new temporary password
    const newPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(newPassword);

    // Update password
    await db.prepare(`
      UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?
    `).bind(passwordHash, targetUserId).run();

    // Revoke all refresh tokens (force re-login)
    await db.prepare(`
      UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE user_id = ? AND revoked_at IS NULL
    `).bind(targetUserId).run();

    // Send email with new password
    // SECURITY: Never include passwords in API responses
    // The password should only be sent via email to the user
    const baseUrl = c.env.APP_URL ||
                    c.req.header('origin') ||
                    `https://${c.req.header('host')}`;

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
      emailSent: emailResult.success
    });

  } catch (error) {
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
      return c.json({ error: 'Unsupported format. Use ?format=json or ?format=csv' }, 400);
    }

    // Fetch user with organization name
    const user = await db.prepare(`
      SELECT u.*, o.name as organization_name
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      WHERE u.id = ?
    `).bind(targetUserId).first();

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Fetch audit log entries referencing this user
    const auditEntries = await db.prepare(`
      SELECT action, entity_type, entity_id, details, created_at
      FROM audit_log
      WHERE user_id = ? OR (entity_type = 'user' AND entity_id = ?)
      ORDER BY created_at DESC
    `).bind(targetUserId, targetUserId).all();

    // Log the SAR in data_rights_log
    await db.prepare(`
      INSERT INTO data_rights_log (id, organization_id, request_type, subject_type, subject_id, requested_by, status, completed_at)
      VALUES (?, ?, 'access', 'user', ?, ?, 'completed', datetime('now'))
    `).bind(generateId(), user.organization_id, targetUserId, currentUserId).run();

    const exportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        exportFormat: 'GDPR Article 15 Subject Access Request',
        organization: user.organization_name || user.organization_id,
        dataController: 'Scratch IT LTD'
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
        updatedAt: user.updated_at
      },
      auditTrail: (auditEntries.results || []).map(a => ({
        action: a.action,
        entityType: a.entity_type,
        entityId: a.entity_id,
        details: a.details || null,
        timestamp: a.created_at
      }))
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
      lines.push(csvRow([
        u.name, u.email, u.role, u.organization, u.authProvider,
        u.isActive, u.lastLoginAt, u.createdAt, u.updatedAt
      ]));
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
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    }

    // JSON format (default)
    const filename = `user-export-${user.name.replace(/[^a-zA-Z0-9]/g, '_')}-${new Date().toISOString().split('T')[0]}.json`;
    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });

  } catch (error) {
    console.error('Export user error:', error);
    return c.json({ error: 'Failed to export user data' }, 500);
  }
});

/**
 * GET /api/users/:id/classes
 * Get class assignments for a user (from Wonde employee-class mapping)
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
      user = await db.prepare(
        'SELECT id, organization_id, wonde_employee_id FROM users WHERE id = ? AND is_active = 1'
      ).bind(targetUserId).first();
    } else {
      user = await db.prepare(
        'SELECT id, organization_id, wonde_employee_id FROM users WHERE id = ? AND organization_id = ? AND is_active = 1'
      ).bind(targetUserId, organizationId).first();
    }

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // If user has no Wonde employee ID, no class assignments to show
    if (!user.wonde_employee_id) {
      return c.json({ classes: [] });
    }

    // Fetch class assignments from wonde_employee_classes joined with classes
    const result = await db.prepare(`
      SELECT c.id as class_id, c.name as class_name, 'wonde' as source
      FROM wonde_employee_classes wec
      JOIN classes c ON c.wonde_class_id = wec.wonde_class_id AND c.organization_id = wec.organization_id
      WHERE wec.wonde_employee_id = ? AND wec.organization_id = ?
      ORDER BY c.name
    `).bind(user.wonde_employee_id, user.organization_id).all();

    const classes = (result.results || []).map(row => ({
      classId: row.class_id,
      className: row.class_name,
      source: row.source
    }));

    return c.json({ classes });

  } catch (error) {
    console.error('Get user classes error:', error);
    return c.json({ error: 'Failed to get user classes' }, 500);
  }
});

/**
 * CSV helper: escape a value and wrap in quotes if needed
 */
function csvRow(values) {
  return values.map(v => {
    if (v === null || v === undefined) return '';
    const str = String(v);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }).join(',');
}

