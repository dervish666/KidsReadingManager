// src/middleware/auth.js
// Simple shared-secret auth for Cloudflare Worker (Hono)
// No external libraries; designed to stop casual access, not be cryptographically perfect.

import { createHash } from '../utils/helpers';

// Header name and prefix used by the client
const AUTH_HEADER = 'authorization';
const AUTH_PREFIX = 'Bearer ';

// How long a token is valid (ms)
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

// Build a simple HMAC-like signature using only built-ins
// WARNING: This is intentionally lightweight; for serious security use a proper crypto/HMAC.
function sign(env, payload) {
  const secret = env.WORKER_ADMIN_PASSWORD || '';
  const data = `${payload}|${secret}`;
  // createHash is a helper we will implement using Web Crypto in helpers.js if not present
  return createHash(data);
}

function encodeToken(obj) {
  const json = JSON.stringify(obj);
  return btoa(json);
}

function decodeToken(token) {
  try {
    const json = atob(token);
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

/**
 * Create a token for a successful login.
 * Token payload:
 * - iat: issued at (ms)
 * - exp: expires at (ms)
 * - sig: simple signature over `${iat}|${exp}` with WORKER_ADMIN_PASSWORD
 */
export function createAuthToken(env) {
  const now = Date.now();
  const exp = now + TOKEN_TTL_MS;
  const base = `${now}|${exp}`;
  const sig = sign(env, base);
  return encodeToken({ iat: now, exp, sig });
}

/**
 * Validate a provided token using the shared password.
 */
export function validateAuthToken(env, token) {
  const decoded = decodeToken(token);
  if (!decoded || typeof decoded !== 'object') return false;

  const { iat, exp, sig } = decoded;
  if (!iat || !exp || !sig) return false;

  const now = Date.now();
  if (now > exp) return false;

  const base = `${iat}|${exp}`;
  const expected = sign(env, base);
  return expected === sig;
}

/**
 * Hono middleware to protect /api/* endpoints using the shared-secret token.
 * - Allows unauthenticated access to:
 *   - /api/login
 *   - /api/health
 */
export function authMiddleware() {
  return async (c, next) => {
    const url = new URL(c.req.url);

    // Public endpoints
    if (url.pathname === '/api/login' || url.pathname === '/api/health') {
      return next();
    }

    const header = c.req.header(AUTH_HEADER) || '';
    if (!header.startsWith(AUTH_PREFIX)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = header.slice(AUTH_PREFIX.length).trim();
    const valid = validateAuthToken(c.env, token);

    if (!valid) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    return next();
  };
}

/**
 * Helper for the /api/login route.
 * Compares posted password with WORKER_ADMIN_PASSWORD and issues a token on success.
 */
export async function handleLogin(c) {
  const env = c.env;
  const body = await c.req.json().catch(() => null);
  const password = body && body.password;

  if (!env.WORKER_ADMIN_PASSWORD) {
    return c.json({ error: 'Server auth not configured' }, 500);
  }

  if (!password || password !== env.WORKER_ADMIN_PASSWORD) {
    return c.json({ error: 'Invalid password' }, 401);
  }

  const token = createAuthToken(env);
  return c.json({ token });
}