---
name: new-route
description: Scaffold a new API route with tenant isolation, role guards, and D1 queries
disable-model-invocation: true
---

# New Route

Scaffold a new Hono API route handler for TallyReading with all required multi-tenant boilerplate.

## Gather Requirements

Ask the user for (if not already provided):
1. **Resource name** (e.g., "reports", "notifications")
2. **HTTP methods** needed (GET, POST, PUT, DELETE)
3. **Role guard level**: `requireOwner()`, `requireAdmin()`, `requireTeacher()`, or `requireReadonly()`
4. **Is this a public endpoint?** (no auth required — rare, needs justification)

## Create the Route File

Create `src/routes/{resourceName}.js` following this structure:

```js
import { Hono } from 'hono';

const app = new Hono();

// GET /api/{resource}
app.get('/', async (c) => {
  const db = c.env.READING_MANAGER_DB;
  const organizationId = c.get('organizationId');

  const { results } = await db.prepare(
    'SELECT * FROM {table} WHERE organization_id = ?'
  ).bind(organizationId).all();

  return c.json(results);
});

export default app;
```

## Checklist

Every route MUST have all of these. Do not skip any:

- [ ] **Tenant scoping**: Every query includes `WHERE organization_id = ?` using `c.get('organizationId')`
- [ ] **Role guard**: Route group or individual routes use the appropriate `require*()` from `src/middleware/tenant.js`
- [ ] **D1 access**: Via `c.env.READING_MANAGER_DB`, using parameterized queries (`?` placeholders, never string interpolation)
- [ ] **Soft delete filtering**: Queries on `organizations` or `users` tables include `WHERE is_active = 1`
- [ ] **Row mapper**: If returning data to the frontend, use or create a `rowTo*()` function in `src/utils/rowMappers.js` for snake_case → camelCase conversion
- [ ] **Input validation**: Validate request body fields; use helpers from `src/utils/validation.js` where applicable
- [ ] **Error handling**: Use `notFoundError()`, `badRequestError()` from `src/middleware/errorHandler.js`
- [ ] **D1 batch limit**: If doing bulk operations, chunk to max 100 statements per `db.batch()` call

## Register the Route

1. Open `src/worker.js`
2. Import the route: `import {resourceName}Routes from './routes/{resourceName}.js';`
3. Mount it with the appropriate middleware:
   ```js
   app.route('/api/{resource}', requireTeacher(), {resourceName}Routes);
   ```
4. If this is a public endpoint, add the path to BOTH:
   - `publicPaths` array in `jwtAuthMiddleware()` in `src/middleware/tenant.js`
   - Tenant middleware bypass in `src/worker.js`
   - **Important**: Use exact path strings, never wildcard `startsWith` patterns

## After Creation

- Update the CLAUDE.md file map with the new route file
- Update `.claude/structure/routes.yaml` with endpoint signatures
- If a new database table is needed, use `/create-migration` to create it
