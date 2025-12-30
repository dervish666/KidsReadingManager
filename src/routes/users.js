/**
 * User Management Routes
 * Handles CRUD operations for users within an organization
 */

import { Hono } from 'hono';
import { generateId } from '../utils/helpers.js';
import { hashPassword, ROLES, hasPermission } from '../utils/crypto.js';
import { requireAdmin, requireOwner, auditLog } from '../middleware/tenant.js';

export const usersRouter = new Hono();

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
 * Convert database row to user object (snake_case to camelCase)
 */
const rowToUser = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    email: row.email,
    name: row.name,
    role: row.role,
    isActive: Boolean(row.is_active),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

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
               u.is_active, u.last_login_at, u.created_at, u.updated_at
        FROM users u
        LEFT JOIN organizations o ON u.organization_id = o.id
        ORDER BY o.name, u.name
      `;
      params = [];
    } else {
      query = `
        SELECT u.id, u.organization_id, o.name as organization_name, u.email, u.name, u.role,
               u.is_active, u.last_login_at, u.created_at, u.updated_at
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
      WHERE id = ? AND organization_id = ?
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

    // Check if email already exists
    const existingUser = await db.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first();

    if (existingUser) {
      return c.json({ error: 'Email already registered' }, 409);
    }

    // Check organization limits
    const org = await db.prepare(
      'SELECT max_teachers FROM organizations WHERE id = ?'
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

    // TODO: Send invitation email with temporary password

    return c.json({
      message: 'User created successfully',
      user: {
        id: userId,
        email: email.toLowerCase(),
        name,
        role,
        isActive: true
      },
      // In development, include the temporary password
      ...(c.env.ENVIRONMENT === 'development' && { temporaryPassword: userPassword })
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

    // Check if user exists (in any organization - we'll check permissions next)
    const existingUser = await db.prepare(`
      SELECT * FROM users WHERE id = ?
    `).bind(targetUserId).first();

    if (!existingUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Determine what can be updated
    const isSelf = targetUserId === currentUserId;
    const isAdmin = hasPermission(currentUserRole, ROLES.ADMIN);
    const isOwner = currentUserRole === ROLES.OWNER;

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
 * POST /api/users/:id/reset-password
 * Reset a user's password (admin action)
 * Requires: admin role
 */
usersRouter.post('/:id/reset-password', requireAdmin(), auditLog('update', 'user'), async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const targetUserId = c.req.param('id');

    // Check if user exists and belongs to organization
    const existingUser = await db.prepare(`
      SELECT * FROM users WHERE id = ? AND organization_id = ?
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

    // TODO: Send email with new password

    return c.json({
      message: 'Password reset successfully',
      // In development, include the new password
      ...(c.env.ENVIRONMENT === 'development' && { temporaryPassword: newPassword })
    });

  } catch (error) {
    console.error('Reset password error:', error);
    return c.json({ error: 'Failed to reset password' }, 500);
  }
});

/**
 * Generate a temporary password
 */
function generateTemporaryPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let password = '';
  for (let i = 0; i < bytes.length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}
