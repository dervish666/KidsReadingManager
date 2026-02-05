// src/middleware/auth.js
// Simple shared-secret auth for Cloudflare Worker (Hono)
// No external libraries; designed to stop casual access, not be cryptographically perfect.

import { constantTimeStringEqual } from '../utils/crypto.js';

// Header name and prefix used by the client
const AUTH_HEADER = 'authorization';
const AUTH_PREFIX = 'Bearer ';

// How long a token is valid (ms)
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

// Build a simple HMAC-like signature using only built-ins
// WARNING: This is intentionally lightweight; for serious security use a proper crypto/HMAC.
async function sign(env, payload) {
  const secret = env.WORKER_ADMIN_PASSWORD || '';
  const data = `${payload}|${secret}`;

  // Lightweight hash using Web Crypto API (Cloudflare Workers compatible)
  const encoder = new TextEncoder();
  const input = encoder.encode(data);
  const digest = await crypto.subtle.digest('SHA-256', input);

  // Convert ArrayBuffer -> hex string
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i].toString(16).padStart(2, '0');
    hex += b;
  }

  return hex;
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
export async function createAuthToken(env) {
  const now = Date.now();
  const exp = now + TOKEN_TTL_MS;
  const base = `${now}|${exp}`;
  const sig = await sign(env, base);
  return encodeToken({ iat: now, exp, sig });
}

/**
 * Validate a provided token using the shared password.
 */
export async function validateAuthToken(env, token) {
  const decoded = decodeToken(token);
  if (!decoded || typeof decoded !== 'object') return false;

  const { iat, exp, sig } = decoded;
  if (!iat || !exp || !sig) return false;

  const now = Date.now();
  if (now > exp) return false;

  const base = `${iat}|${exp}`;
  const expected = await sign(env, base);
  return constantTimeStringEqual(expected, sig);
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
    const valid = await validateAuthToken(c.env, token);

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

  if (!password || !constantTimeStringEqual(password, env.WORKER_ADMIN_PASSWORD)) {
    return c.json({ error: 'Invalid password' }, 401);
  }

  const token = await createAuthToken(env);
  return c.json({ token });
}