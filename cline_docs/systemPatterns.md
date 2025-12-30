# System Patterns: Kids Reading Manager

## Architecture Patterns

### Frontend Architecture
- **Component-Based Structure**: UI is organized into reusable components
- **Context API for State Management**: AppContext provides global state and functions
- **Responsive Design**: Mobile-first approach with Material-UI v7
- **Memoization**: React.useMemo and React.useCallback for performance optimization

### Backend Architecture
- **Serverless API**: Cloudflare Workers using Hono framework
- **RESTful Endpoints**: API routes defined in `src/routes/`
- **Middleware Pattern**: Authentication, tenant isolation, and error handling
- **Provider Pattern**: Data access abstracted through provider layer (D1/KV)

### Multi-Tenant Architecture
- **Organization Isolation**: All data scoped to user's organization
- **Tenant Middleware**: Automatic context injection for all requests
- **Role-Based Access Control**: Hierarchical permissions (owner > admin > teacher > readonly)
- **Cross-Tenant Operations**: Owner-only access to multiple organizations

## Key Technical Decisions

### State Management
- **AppContext Provider**: Central state management for the entire application
- **Optimistic Updates**: UI updates immediately while API calls happen in background
- **Error Handling**: API errors trigger rollback of optimistic updates
- **Token Management**: Automatic JWT refresh on 401 responses

### Data Flow
1. **Authentication**: JWT tokens stored in context, sent with all API requests
2. **Data Loading**: Fetched from API on initial render, scoped by organization
3. **CRUD Operations**: 
   - Create: Add students, sessions, books, users, organizations
   - Read: Display data filtered by organization and permissions
   - Update: Edit with optimistic updates and rollback
   - Delete: Soft delete for organizations/users, hard delete for sessions
4. **Data Persistence**: D1 database for multi-tenant, KV for legacy mode

### Authentication Patterns
- **JWT-Based Auth**: Access tokens (15 min) + refresh tokens (7 days)
- **Token Refresh**: Automatic refresh 60 seconds before expiration
- **Password Security**: PBKDF2 with 100,000 iterations and random salt
- **Role Verification**: Middleware checks permissions before route handlers

### API Patterns
- **fetchWithAuth**: All API calls go through authenticated fetch wrapper
- **Relative Paths**: API calls use `/api/*` paths (same-origin)
- **Error Responses**: Consistent error format with status codes and messages
- **Pagination**: Books API supports `?page=N&limit=M` parameters

### UI Patterns
- **Card-Based Interface**: Students displayed as cards with status indicators
- **Modal Dialogs**: Used for forms, editing, and confirmations
- **Visual Status Indicators**: Color-coded to show reading status
- **Quick Actions**: Efficient workflows for common tasks
- **Global Filters**: Class filter persists across all pages
- **Drag-and-Drop**: Student reordering in reading register

## Code Organization

### Directory Structure
```
src/
├── components/          # UI components organized by feature
│   ├── books/          # Book management
│   ├── classes/        # Class management
│   ├── sessions/       # Reading sessions
│   ├── stats/          # Statistics and charts
│   └── students/       # Student management
├── contexts/           # Context providers
│   └── AppContext.js   # Main application state
├── data/               # Data access layer
│   ├── d1Provider.js   # D1 database operations
│   ├── kvProvider.js   # KV storage operations
│   └── index.js        # Provider factory
├── middleware/         # Hono middleware
│   ├── auth.js         # JWT authentication
│   ├── errorHandler.js # Error handling
│   └── tenant.js       # Multi-tenant context
├── routes/             # API route handlers
├── services/           # Business logic
├── styles/             # Theme configuration
├── utils/              # Utility functions
└── worker.js           # Cloudflare Worker entry
```

### Component Patterns
- **Container/Presentation Pattern**: 
  - Container components connect to context and handle logic
  - Presentation components focus on rendering UI
- **Composition**: Complex UIs built from smaller, focused components
- **Hooks**: Custom hooks for reusable logic (e.g., form handling)

### Data Provider Pattern
```javascript
// Provider factory auto-detects storage type
import { createProvider } from './data';

// In route handler
const provider = createProvider(env);
const books = await provider.getBooks();
```

### Middleware Chain
```javascript
// Worker entry point
app.use('*', errorHandler);
app.use('/api/*', authMiddleware);
app.use('/api/*', tenantMiddleware);
app.route('/api/auth', authRoutes);
app.route('/api/users', userRoutes);
// ... other routes
```

### Authentication Flow
```
1. User submits credentials
2. Server validates and returns JWT + refresh token
3. Client stores tokens in AppContext
4. fetchWithAuth adds Authorization header to all requests
5. On 401, client attempts token refresh
6. If refresh fails, user is logged out
```

### Multi-Tenant Data Access
```javascript
// Tenant middleware injects organization context
app.use('/api/*', async (c, next) => {
  const user = c.get('user');
  c.set('organizationId', user.organizationId);
  await next();
});

// Route handlers use organization context
app.get('/api/students', async (c) => {
  const orgId = c.get('organizationId');
  const students = await db.prepare(
    'SELECT * FROM students WHERE organization_id = ?'
  ).bind(orgId).all();
  return c.json(students);
});
```

## Database Patterns

### D1 Schema Conventions
- **snake_case columns**: Database uses snake_case (e.g., `organization_id`)
- **camelCase in JS**: JavaScript uses camelCase (e.g., `organizationId`)
- **Conversion Layer**: Provider handles case conversion

### Soft Delete Pattern
```sql
-- Organizations and users use soft delete
UPDATE organizations SET is_active = 0 WHERE id = ?;
UPDATE users SET is_active = 0 WHERE id = ?;
```

### Full-Text Search
```sql
-- FTS5 virtual table for book search
CREATE VIRTUAL TABLE books_fts USING fts5(title, author, content=books);

-- Search query
SELECT * FROM books WHERE id IN (
  SELECT rowid FROM books_fts WHERE books_fts MATCH ?
);
```

### Batch Operations
```javascript
// D1 batch limited to 100 statements
const BATCH_SIZE = 100;
for (let i = 0; i < books.length; i += BATCH_SIZE) {
  const batch = books.slice(i, i + BATCH_SIZE);
  await db.batch(batch.map(book => 
    db.prepare('INSERT INTO books ...').bind(...)
  ));
}
```
