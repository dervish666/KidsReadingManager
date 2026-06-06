/**
 * Shared helpers for the auth route modules.
 *
 * The auth surface area is split across several files for readability —
 * registration (`register.js`), the JWT session lifecycle (`session.js`)
 * and password management (`password.js`). These helpers are imported
 * wherever they're needed. They were inlined in auth.js before the split.
 */

import { generateId } from '../../utils/helpers.js';

// Account lockout configuration
export const MAX_LOGIN_ATTEMPTS = 5; // Maximum failed attempts before lockout
export const LOCKOUT_DURATION_MINUTES = 15; // Lockout duration in minutes

/**
 * Check if account is locked due to too many failed attempts
 */
export async function isAccountLocked(db, email) {
  try {
    const result = await db
      .prepare(
        `
      SELECT COUNT(*) as count FROM login_attempts
      WHERE email = ? AND success = 0
      AND created_at > datetime('now', ?)
    `
      )
      .bind(email.toLowerCase(), `-${LOCKOUT_DURATION_MINUTES} minutes`)
      .first();

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
export async function recordLoginAttempt(db, email, ipAddress, userAgent, success) {
  try {
    await db
      .prepare(
        `
      INSERT INTO login_attempts (id, email, ip_address, user_agent, success)
      VALUES (?, ?, ?, ?, ?)
    `
      )
      .bind(
        generateId(),
        email.toLowerCase(),
        ipAddress || 'unknown',
        userAgent || 'unknown',
        success ? 1 : 0
      )
      .run();

    // Cleanup old attempts (older than 24 hours) - async, don't wait
    db.prepare(
      `
      DELETE FROM login_attempts WHERE created_at < datetime('now', '-24 hours')
    `
    )
      .run()
      .catch(() => {});
  } catch (error) {
    // Don't fail login if logging fails
    console.error('Error recording login attempt:', error);
  }
}

/**
 * Clear failed login attempts on successful login
 */
export async function clearFailedAttempts(db, email) {
  try {
    await db
      .prepare(
        `
      DELETE FROM login_attempts WHERE email = ? AND success = 0
    `
      )
      .bind(email.toLowerCase())
      .run();
  } catch (error) {
    console.error('Error clearing failed attempts:', error);
  }
}

/**
 * Helper to parse cookies from request
 */
export function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) {
      cookies[name] = rest.join('=');
    }
  });
  return cookies;
}
