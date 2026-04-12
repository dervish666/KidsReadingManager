/**
 * MyLogin OAuth2 SSO Routes
 *
 * Implements MyLogin (part of Wonde) OAuth2 Authorization Code flow for
 * school SSO login. Three endpoints:
 *
 * - GET  /login    — Redirects to MyLogin authorize URL with CSRF state
 * - GET  /callback — Exchanges auth code, fetches user, issues Tally JWT
 * - POST /logout   — Revokes refresh token, returns MyLogin logout URL
 *
 * Mounted at: /api/auth/mylogin
 */

import { Hono } from 'hono';
import {
  createRefreshToken,
  hashToken,
  buildRefreshCookie,
  buildClearRefreshCookie,
  ROLE_HIERARCHY,
} from '../utils/crypto.js';
import { generateId } from '../utils/helpers.js';
import { syncUserClassAssignments } from '../utils/classAssignments.js';
import { parseCookies } from './auth.js';

export const myloginRouter = new Hono();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map MyLogin user type to Tally role.
 */
function mapMyLoginTypeToRole(type) {
  switch (type) {
    case 'admin':
      return 'admin';
    case 'employee':
      return 'teacher';
    case 'student':
      return 'readonly';
    default:
      return 'readonly';
  }
}

// ---------------------------------------------------------------------------
// GET /login
// ---------------------------------------------------------------------------

myloginRouter.get('/login', async (c) => {
  // Generate random state for CSRF protection
  const state = crypto.randomUUID();
  const db = c.env.READING_MANAGER_DB;

  // Store state in D1 (strongly consistent, unlike KV which is eventually consistent)
  if (db) {
    await db.prepare('INSERT INTO oauth_state (state) VALUES (?)').bind(state).run();
  } else {
    // Fallback to KV if D1 not available
    await c.env.READING_MANAGER_KV.put(`oauth_state:${state}`, '1', { expirationTtl: 300 });
  }

  // Build MyLogin authorize URL
  const authorizeUrl = new URL('https://app.mylogin.com/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', c.env.MYLOGIN_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', c.env.MYLOGIN_REDIRECT_URI);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('state', state);

  return c.redirect(authorizeUrl.toString());
});

// ---------------------------------------------------------------------------
// GET /callback
// ---------------------------------------------------------------------------

myloginRouter.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const db = c.env.READING_MANAGER_DB;

  try {
    // -----------------------------------------------------------------------
    // 1. Verify state (CSRF protection)
    // -----------------------------------------------------------------------
    // If state is missing or unrecognised, redirect to start a proper
    // SP-initiated flow. This handles IDP-initiated login (user clicking
    // login on MyLogin's site) — the unverified code is discarded and a
    // fresh OAuth flow begins with CSRF-safe state. MyLogin will
    // auto-approve since the user already has an active session.
    if (!state) {
      return c.redirect('/api/auth/mylogin/login');
    }

    // Check D1 first (strongly consistent), fall back to KV
    let stateValid = false;
    if (db) {
      const row = await db
        .prepare('SELECT state FROM oauth_state WHERE state = ?')
        .bind(state)
        .first();
      if (row) {
        stateValid = true;
        await db.prepare('DELETE FROM oauth_state WHERE state = ?').bind(state).run();
      }
    }
    if (!stateValid) {
      // Fallback: check KV (for in-flight states stored before D1 migration)
      const kvState = await c.env.READING_MANAGER_KV.get(`oauth_state:${state}`);
      if (kvState) {
        stateValid = true;
        await c.env.READING_MANAGER_KV.delete(`oauth_state:${state}`);
      }
    }
    if (!stateValid) {
      return c.redirect('/api/auth/mylogin/login');
    }

    // -----------------------------------------------------------------------
    // 2. Exchange authorization code for access token
    // -----------------------------------------------------------------------
    const clientId = (c.env.MYLOGIN_CLIENT_ID || '').trim();
    const clientSecret = (c.env.MYLOGIN_CLIENT_SECRET || '').trim();
    const redirectUri = (c.env.MYLOGIN_REDIRECT_URI || '').trim();

    // Use both Basic auth header AND body params for maximum compatibility
    const credentials = btoa(`${clientId}:${clientSecret}`);
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const tokenRes = await fetch('https://app.mylogin.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: tokenBody.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[MyLogin] Token exchange failed:', tokenRes.status, errText);
      return c.redirect('/?auth=error&reason=token_exchange_failed');
    }

    const tokenData = await tokenRes.json();
    if (tokenData.token_type?.toLowerCase() !== 'bearer') {
      console.error('[MyLogin] Unexpected token_type:', tokenData.token_type);
      return c.redirect('/?auth=error&reason=token_exchange_failed');
    }
    const accessToken = tokenData.access_token;

    // -----------------------------------------------------------------------
    // 3. Fetch user profile from MyLogin
    // -----------------------------------------------------------------------
    const userRes = await fetch('https://app.mylogin.com/api/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userRes.ok) {
      const errText = await userRes.text();
      console.error('[MyLogin] User profile fetch failed:', userRes.status, errText);
      return c.redirect('/?auth=error&reason=user_fetch_failed');
    }

    const profileResponse = await userRes.json();
    // MyLogin wraps the user profile in a "data" property
    const profile = profileResponse.data || profileResponse;

    // -----------------------------------------------------------------------
    // 4. Extract user data
    // -----------------------------------------------------------------------
    const myloginId = profile.id;
    const name = `${profile.first_name} ${profile.last_name}`.trim();
    const email = profile.email;
    const userType = profile.type;
    const role = mapMyLoginTypeToRole(userType);
    const wondeEmployeeId = profile.service_providers?.wonde?.service_provider_id || null;
    const wondeSchoolId = profile.organisation?.wonde_id || null;

    // -----------------------------------------------------------------------
    // 5. Match organization by wonde_school_id
    // -----------------------------------------------------------------------
    if (!wondeSchoolId) {
      console.error('[MyLogin] No wonde_id in user profile for', email);
      return c.redirect('/?auth=error&reason=no_school');
    }

    const org = await db
      .prepare(
        'SELECT id, slug, name FROM organizations WHERE wonde_school_id = ? AND is_active = 1'
      )
      .bind(wondeSchoolId)
      .first();

    if (!org) {
      console.error('[MyLogin] No org found for wonde_school_id:', wondeSchoolId, '- user:', email);
      return c.redirect('/?auth=error&reason=school_not_found');
    }

    // -----------------------------------------------------------------------
    // 6. Match or create user by mylogin_id
    // -----------------------------------------------------------------------
    let userId;

    const existingUser = await db
      .prepare(
        'SELECT id, organization_id, name, email, role FROM users WHERE mylogin_id = ? AND is_active = 1'
      )
      .bind(String(myloginId))
      .first();

    if (existingUser) {
      // Update existing user — sync name and email from IdP.
      // Role: allow demotions and lateral moves, but never auto-elevate.
      userId = existingUser.id;
      const idpRole = role; // mapped from MyLogin profile type
      const currentLevel = ROLE_HIERARCHY[existingUser.role] || 0;
      const idpLevel = ROLE_HIERARCHY[idpRole] || 0;
      let effectiveRole = existingUser.role;

      if (idpLevel <= currentLevel) {
        // Same or lower privilege — safe to sync from IdP
        effectiveRole = idpRole;
      } else {
        // IdP wants to elevate — keep existing role and log warning
        console.warn(
          `[MyLogin] Blocked role elevation for ${name}: IdP wants ${idpRole} but user has ${existingUser.role}. Keeping existing role.`
        );
      }

      if (existingUser.role !== effectiveRole) {
        console.log(`[MyLogin] Role changed for ${name}: ${existingUser.role} → ${effectiveRole}`);
      }
      await db
        .prepare(
          `UPDATE users SET name = ?, email = ?, role = ?, last_login_at = datetime("now"), updated_at = datetime("now")
         WHERE id = ?`
        )
        .bind(name, email, effectiveRole, userId)
        .run();
    } else {
      // Create new user
      userId = generateId();
      const placeholderHash = crypto.randomUUID(); // placeholder password hash

      await db
        .prepare(
          `INSERT INTO users (id, organization_id, name, email, mylogin_id, wonde_employee_id, auth_provider, role, password_hash, is_active, created_at, updated_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime("now"), datetime("now"), datetime("now"))`
        )
        .bind(
          userId,
          org.id,
          name,
          email,
          String(myloginId),
          wondeEmployeeId,
          'mylogin',
          role,
          placeholderHash
        )
        .run();
    }

    // Sync class assignments for teachers (runs for both new and existing users)
    if (role === 'teacher' && wondeEmployeeId) {
      try {
        const assignedCount = await syncUserClassAssignments(db, userId, wondeEmployeeId, org.id);
        if (assignedCount > 0) {
          console.log(`[MyLogin] Synced ${assignedCount} class assignment(s) for ${name}`);
        }
      } catch (err) {
        console.warn('[MyLogin] Could not sync class assignments:', err.message);
      }
    }

    // -----------------------------------------------------------------------
    // 7. Issue Tally JWT (same pattern as src/routes/auth.js)
    // -----------------------------------------------------------------------

    // Access token is obtained by the frontend via /api/auth/refresh after redirect.
    // We only need to issue the refresh token here (delivered as httpOnly cookie).
    const refreshTokenData = await createRefreshToken(userId, c.env.JWT_SECRET);

    // Store refresh token hash
    await db
      .prepare(
        'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)'
      )
      .bind(generateId(), userId, refreshTokenData.hash, refreshTokenData.expiresAt)
      .run();

    // Set httpOnly cookie
    const isProduction = c.env.ENVIRONMENT !== 'development';

    // -----------------------------------------------------------------------
    // 8. Redirect to app with access token
    // -----------------------------------------------------------------------
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/?auth=callback',
        'Set-Cookie': buildRefreshCookie(refreshTokenData.token, isProduction),
      },
    });
  } catch (error) {
    console.error('[MyLogin] Callback error:', error);
    return c.redirect('/?auth=error&reason=internal');
  }
});

// ---------------------------------------------------------------------------
// POST /logout
// ---------------------------------------------------------------------------

myloginRouter.post('/logout', async (c) => {
  try {
    const db = c.env.READING_MANAGER_DB;

    // Try to get refresh token from cookie
    const cookies = parseCookies(c.req.header('cookie'));
    const refreshToken = cookies.refresh_token;

    if (refreshToken && db) {
      const tokenHash = await hashToken(refreshToken);
      await db
        .prepare('UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE token_hash = ?')
        .bind(tokenHash)
        .run();
    }

    // Clear the refresh token cookie
    const isProduction = c.env.ENVIRONMENT !== 'development';
    c.header('Set-Cookie', buildClearRefreshCookie(isProduction));

    // Return MyLogin logout URL for the frontend to redirect to
    const logoutUrl = new URL('https://app.mylogin.com/oauth/logout');
    logoutUrl.searchParams.set('client_id', c.env.MYLOGIN_CLIENT_ID);

    return c.json({ logoutUrl: logoutUrl.toString() });
  } catch (error) {
    console.error('[MyLogin] Logout error:', error);
    return c.json({ error: 'Logout failed' }, 500);
  }
});
