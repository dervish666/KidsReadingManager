import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

/**
 * Pins the middleware-ordering rule behind the CSV-import fix.
 *
 * src/worker.js registers a 1MB bodyLimit on /api/* before any router is
 * mounted. routes/books/import.js registers a 5MB bodyLimit on /import/*.
 * Hono runs middleware in registration order, so the global limit ran first
 * and rejected the request — the "override" never got a say, and large
 * library imports failed at 1MB with a generic error for as long as the
 * override had existed.
 *
 * A later, larger bodyLimit cannot widen an earlier, smaller one. The only fix
 * is for the earlier one to skip the path. These tests demonstrate both halves
 * so the next person to add a large-upload endpoint knows which lever works.
 *
 * NOTE: this mirrors worker.js's registration rather than importing it —
 * worker.js's only export is the Sentry-wrapped handler, so the app itself is
 * not reachable from a test. If you change the ordering in worker.js, change
 * it here too.
 */

const TWO_MB = 'x'.repeat(2 * 1024 * 1024);

const postBody = (app, path, body) =>
  app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

describe('bodyLimit registration order', () => {
  it('a later, larger bodyLimit does NOT override an earlier, smaller one', () => {
    const app = new Hono();
    app.use('/api/*', bodyLimit({ maxSize: 1024 * 1024 })); // global, first
    app.use('/api/books/import/*', bodyLimit({ maxSize: 5 * 1024 * 1024 })); // override, later
    app.post('/api/books/import/confirm', (c) => c.json({ ok: true }));

    return postBody(app, '/api/books/import/confirm', TWO_MB).then((res) => {
      // This is the bug: 2MB is under the route's own 5MB limit, but the
      // global 1MB limit already rejected it.
      expect(res.status).toBe(413);
    });
  });

  it('excluding the path from the global limit lets the route’s own limit apply', async () => {
    const LARGER_BODY_LIMIT_PATHS = ['/api/books/import/'];
    const app = new Hono();
    app.use('/api/*', async (c, next) => {
      if (LARGER_BODY_LIMIT_PATHS.some((p) => c.req.path.startsWith(p))) return next();
      return bodyLimit({ maxSize: 1024 * 1024 })(c, next);
    });
    app.use('/api/books/import/*', bodyLimit({ maxSize: 5 * 1024 * 1024 }));
    app.post('/api/books/import/confirm', (c) => c.json({ ok: true }));

    const res = await postBody(app, '/api/books/import/confirm', TWO_MB);
    expect(res.status).toBe(200);
  });

  it('still enforces the 1MB limit on every other /api route', async () => {
    const LARGER_BODY_LIMIT_PATHS = ['/api/books/import/'];
    const app = new Hono();
    app.use('/api/*', async (c, next) => {
      if (LARGER_BODY_LIMIT_PATHS.some((p) => c.req.path.startsWith(p))) return next();
      return bodyLimit({ maxSize: 1024 * 1024 })(c, next);
    });
    app.post('/api/students', (c) => c.json({ ok: true }));

    const res = await postBody(app, '/api/students', TWO_MB);
    expect(res.status).toBe(413);
  });

  it('still enforces the 5MB ceiling on the import path', async () => {
    const LARGER_BODY_LIMIT_PATHS = ['/api/books/import/'];
    const app = new Hono();
    app.use('/api/*', async (c, next) => {
      if (LARGER_BODY_LIMIT_PATHS.some((p) => c.req.path.startsWith(p))) return next();
      return bodyLimit({ maxSize: 1024 * 1024 })(c, next);
    });
    app.use('/api/books/import/*', bodyLimit({ maxSize: 5 * 1024 * 1024 }));
    app.post('/api/books/import/confirm', (c) => c.json({ ok: true }));

    // Excluding a path from the global limit must not leave it unlimited.
    const res = await postBody(app, '/api/books/import/confirm', 'y'.repeat(6 * 1024 * 1024));
    expect(res.status).toBe(413);
  });
});
