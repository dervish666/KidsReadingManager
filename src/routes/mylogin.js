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
  createJWTPayload,
  createAccessToken,
  createRefreshToken,
  hashToken
} from '../utils/crypto.js';
import { generateId } from '../utils/helpers.js';

export const myloginRouter = new Hono();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse cookies from the Cookie header string.
 * Defined locally since the same helper in auth.js is not exported.
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) {
      cookies[name] = rest.join('=');
    }
  });
  return cookies;
}

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

  // Store state in KV with 5-minute TTL
  await c.env.READING_MANAGER_KV.put(`oauth_state:${state}`, '1', { expirationTtl: 300 });

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
    const stateValue = await c.env.READING_MANAGER_KV.get(`oauth_state:${state}`);
    if (!stateValue) {
      return c.redirect('/?auth=error&reason=invalid_state');
    }

    // Delete state so it cannot be reused
    await c.env.READING_MANAGER_KV.delete(`oauth_state:${state}`);

    // -----------------------------------------------------------------------
    // 2. Exchange authorization code for access token
    // -----------------------------------------------------------------------
    const credentials = btoa(`${c.env.MYLOGIN_CLIENT_ID}:${c.env.MYLOGIN_CLIENT_SECRET}`);

    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: c.env.MYLOGIN_REDIRECT_URI
    });

    const tokenRes = await fetch('https://app.mylogin.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`
      },
      body: tokenBody.toString()
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[MyLogin] Token exchange failed:', tokenRes.status, errText);
      return c.redirect('/?auth=error&reason=token_exchange_failed');
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // -----------------------------------------------------------------------
    // 3. Fetch user profile from MyLogin
    // -----------------------------------------------------------------------
    const userRes = await fetch('https://app.mylogin.com/api/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!userRes.ok) {
      const errText = await userRes.text();
      console.error('[MyLogin] User profile fetch failed:', userRes.status, errText);
      return c.redirect('/?auth=error&reason=user_fetch_failed');
    }

    const profile = await userRes.json();

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

    const org = await db.prepare(
      'SELECT id, slug, name FROM organizations WHERE wonde_school_id = ? AND is_active = 1'
    ).bind(wondeSchoolId).first();

    if (!org) {
      console.error('[MyLogin] No org found for wonde_school_id:', wondeSchoolId);
      return c.redirect('/?auth=error&reason=school_not_found');
    }

    // -----------------------------------------------------------------------
    // 6. Match or create user by mylogin_id
    // -----------------------------------------------------------------------
    let userId;

    const existingUser = await db.prepare(
      'SELECT id, organization_id, name, email, role FROM users WHERE mylogin_id = ? AND is_active = 1'
    ).bind(String(myloginId)).first();

    if (existingUser) {
      // Update existing user
      userId = existingUser.id;
      await db.prepare(
        `UPDATE users SET name = ?, email = ?, last_login_at = datetime("now"), updated_at = datetime("now")
         WHERE id = ?`
      ).bind(name, email, userId).run();
    } else {
      // Create new user
      userId = generateId();
      const placeholderHash = crypto.randomUUID(); // placeholder password hash

      await db.prepare(
        `INSERT INTO users (id, organization_id, name, email, mylogin_id, wonde_employee_id, auth_provider, role, password_hash, is_active, created_at, updated_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime("now"), datetime("now"), datetime("now"))`
      ).bind(
        userId,
        org.id,
        name,
        email,
        String(myloginId),
        wondeEmployeeId,
        'mylogin',
        role,
        placeholderHash
      ).run();

      // For new teachers, look up their classes from wonde_employee_classes
      if (role === 'teacher' && wondeEmployeeId) {
        try {
          const classResults = await db.prepare(
            'SELECT wonde_class_id FROM wonde_employee_classes WHERE organization_id = ? AND wonde_employee_id = ?'
          ).bind(org.id, wondeEmployeeId).all();

          if (classResults.results && classResults.results.length > 0) {
            console.log(`[MyLogin] Found ${classResults.results.length} class(es) for new teacher ${name}`);

            // Attempt to assign classes via class_assignments table
            for (const row of classResults.results) {
              try {
                const tallyClass = await db.prepare(
                  'SELECT id FROM classes WHERE wonde_class_id = ? AND organization_id = ?'
                ).bind(row.wonde_class_id, org.id).first();

                if (tallyClass) {
                  await db.prepare(
                    'INSERT OR IGNORE INTO class_assignments (id, class_id, user_id, created_at) VALUES (?, ?, ?, datetime("now"))'
                  ).bind(generateId(), tallyClass.id, userId).run();
                }
              } catch (classErr) {
                // class_assignments table may not exist yet — graceful fallback
                console.warn('[MyLogin] Could not assign class:', classErr.message);
              }
            }
          }
        } catch (empClassErr) {
          console.warn('[MyLogin] Could not look up employee classes:', empClassErr.message);
        }
      }
    }

    // -----------------------------------------------------------------------
    // 7. Issue Tally JWT (same pattern as src/routes/auth.js)
    // -----------------------------------------------------------------------
    const userForPayload = {
      id: userId,
      email,
      name,
      role: existingUser ? existingUser.role : role
    };

    const payload = createJWTPayload(userForPayload, { id: org.id, slug: org.slug });
    const tallyAccessToken = await createAccessToken(payload, c.env.JWT_SECRET);
    const refreshTokenData = await createRefreshToken(userId, c.env.JWT_SECRET);

    // Store refresh token hash
    await db.prepare(
      'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(generateId(), userId, refreshTokenData.hash, refreshTokenData.expiresAt).run();

    // Set httpOnly cookie (same pattern as src/routes/auth.js:384-396)
    const isProduction = c.env.ENVIRONMENT !== 'development';
    const cookieOptions = [
      `refresh_token=${refreshTokenData.token}`,
      'HttpOnly',
      'Path=/api/auth',
      `Max-Age=${7 * 24 * 60 * 60}`,
      'SameSite=Strict',
      isProduction ? 'Secure' : ''
    ].filter(Boolean).join('; ');

    // -----------------------------------------------------------------------
    // 8. Redirect to app with access token
    // -----------------------------------------------------------------------
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/?auth=callback',
        'Set-Cookie': cookieOptions
      }
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

    if (refreshToken) {
      const tokenHash = await hashToken(refreshToken);
      await db.prepare(
        'UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE token_hash = ?'
      ).bind(tokenHash).run();
    }

    // Clear the refresh token cookie
    const isProduction = c.env.ENVIRONMENT !== 'development';
    const clearCookieOptions = [
      'refresh_token=',
      'HttpOnly',
      'Path=/api/auth',
      'Max-Age=0',
      'SameSite=Strict',
      isProduction ? 'Secure' : ''
    ].filter(Boolean).join('; ');

    c.header('Set-Cookie', clearCookieOptions);

    // Return MyLogin logout URL for the frontend to redirect to
    const logoutUrl = new URL('https://app.mylogin.com/oauth/logout');
    logoutUrl.searchParams.set('client_id', c.env.MYLOGIN_CLIENT_ID);

    return c.json({ logoutUrl: logoutUrl.toString() });

  } catch (error) {
    console.error('[MyLogin] Logout error:', error);
    return c.json({ error: 'Logout failed' }, 500);
  }
});
