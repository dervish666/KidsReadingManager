# Technical Context: Kids Reading Manager

## Technologies Used

### Frontend
- **React v19**: Core UI framework
- **Material-UI (MUI) v7**: Component library for styling and UI elements
- **Context API**: State management via AppContext with React.useMemo and React.useCallback optimizations
- **@dnd-kit**: Drag-and-drop functionality for student reordering

### Backend
- **Hono v4.7.7**: Lightweight web framework for Cloudflare Workers
- **Cloudflare Workers**: Serverless execution environment for API endpoints
- **Web Crypto API**: JWT signing/verification and PBKDF2 password hashing

### Data Storage
- **Cloudflare D1**: SQL database for multi-tenant data storage
  - Organizations, users, classes, students, reading sessions
  - Books with FTS5 full-text search
  - Genres and settings
- **Cloudflare KV**: Key-value storage (legacy single-tenant mode)
- **uuid v11**: For generating unique identifiers

### Authentication (Multi-Tenant Mode)
- **JWT Tokens**: Access tokens (15 min) and refresh tokens (7 days)
- **PBKDF2**: Password hashing with 100,000 iterations
- **Role-Based Access Control**: owner, admin, teacher, readonly roles

### External APIs
- **OpenLibrary API**: Book metadata, covers, and descriptions (default)
- **Google Books API**: Alternative book metadata provider
- **AI Providers**: Anthropic Claude, OpenAI GPT, Google Gemini for recommendations

### Development Tools
- **Wrangler v4.51.0**: CLI tool for developing and deploying Cloudflare Workers
- **@rsbuild/core v1.3.9**: Build tool powered by Rspack for frontend assets
- **@rsbuild/plugin-react v1.2.0**: React plugin for Rsbuild

## Development Setup

### Local Development
1. **Prerequisites**:
   - Node.js and npm required
   - Cloudflare account for D1 database

2. **Initial Setup**:
   ```bash
   npm install
   npx wrangler d1 migrations apply reading-manager-db --local
   ```

3. **Running the Application**:
   - `npm run start` - Frontend dev server (rsbuild) at http://localhost:3001
   - `npm run dev` - Cloudflare Worker dev mode (wrangler dev) at http://localhost:8787
   - `npm run start:dev` - Runs both frontend and worker concurrently

4. **Access Points**:
   - Frontend: http://localhost:3001 (proxies to Worker)
   - Worker API: http://localhost:8787

### Cloudflare Deployment
1. **Prerequisites**:
   - Cloudflare account required
   - D1 database created
   - KV namespace created (for legacy mode)

2. **Configuration**:
   - Configure `wrangler.toml` with D1 database and KV namespace bindings
   - Set `JWT_SECRET` environment variable for multi-tenant mode

3. **Database Migrations**:
   ```bash
   npx wrangler d1 migrations apply reading-manager-db --remote
   ```

4. **Deployment**:
   ```bash
   npm run build && npm run deploy
   ```

## Technical Constraints

### Multi-Tenant Architecture
- All data queries automatically scoped to user's organization
- Tenant middleware injects organization context
- Cross-organization access restricted to owner role

### Database Patterns
- D1 uses snake_case columns, JavaScript uses camelCase
- Conversion handled in provider layer (d1Provider.js)
- D1 batch operations limited to 100 statements per batch
- FTS5 full-text search for book queries

### Authentication Patterns
- JWT tokens signed with Web Crypto API (Workers-compatible)
- Access tokens expire in 15 minutes
- Refresh tokens expire in 7 days
- Automatic token refresh on 401 responses (60-second buffer)

### API Patterns
- All internal API calls use `fetchWithAuth` from AppContext
- API routes defined in `src/routes/` using Hono
- Optimistic updates with rollback on failure
- API calls use relative `/api` paths (same-origin serving)

### UUID Generation
- Uses Web Crypto API (`crypto.getRandomValues`) not Node.js crypto
- `generateId()` helper in `src/utils/helpers.js` for Worker compatibility

### Performance Optimizations
- React Context with useMemo and useCallback for derived data
- Paginated book retrieval (50 books per page)
- Smart book filtering for AI recommendations (database-level)
- Book search uses FTS5 full-text search

## Environment Variables

### Required for Multi-Tenant Mode
- `JWT_SECRET`: Secret key for JWT signing (enables multi-tenant mode)

### Optional
- `ANTHROPIC_API_KEY`: Fallback API key for AI recommendations

### Cloudflare Bindings (wrangler.toml)
- `READING_MANAGER_DB`: D1 database binding
- `READING_MANAGER_KV`: KV namespace binding

## File Structure

```
src/
├── components/          # React UI components
│   ├── books/          # Book management components
│   ├── classes/        # Class management components
│   ├── sessions/       # Reading session components
│   ├── stats/          # Statistics and charts
│   └── students/       # Student management components
├── contexts/           # React Context providers
│   └── AppContext.js   # Main application state
├── data/               # Data providers
│   ├── d1Provider.js   # D1 database operations
│   ├── kvProvider.js   # KV storage operations
│   └── index.js        # Provider factory
├── middleware/         # Hono middleware
│   ├── auth.js         # JWT authentication
│   ├── errorHandler.js # Error handling
│   └── tenant.js       # Multi-tenant context
├── routes/             # API route handlers
│   ├── auth.js         # Authentication endpoints
│   ├── books.js        # Book CRUD operations
│   ├── classes.js      # Class management
│   ├── genres.js       # Genre management
│   ├── organization.js # Organization management
│   ├── settings.js     # Settings management
│   ├── students.js     # Student management
│   └── users.js        # User management
├── services/           # Business logic services
│   └── aiService.js    # AI recommendation service
├── styles/             # Theme and styling
│   └── theme.js        # Material-UI theme
├── utils/              # Utility functions
│   ├── bookMetadataApi.js  # Unified metadata API
│   ├── crypto.js       # JWT and password utilities
│   ├── googleBooksApi.js   # Google Books integration
│   ├── helpers.js      # General helpers
│   ├── openLibraryApi.js   # OpenLibrary integration
│   └── validation.js   # Input validation
├── worker.js           # Cloudflare Worker entry point
└── index.js            # React app entry point

migrations/             # D1 database migrations
├── 0001_create_books_table.sql
├── 0002_organizations_users.sql
├── 0003_classes_students.sql
├── 0004_reading_sessions.sql
├── 0005_org_book_selections.sql
├── 0006_org_settings.sql
├── 0007_genres.sql
└── ...
```
