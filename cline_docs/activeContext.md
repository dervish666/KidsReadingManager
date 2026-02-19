# Active Context: Tally Reading

## Current Version: 2.3.0

## What I'm Working On Now
Documentation review and update to ensure all documentation reflects the current state of the application after the major v2.0.0 multi-tenant SaaS transformation and subsequent feature additions.

## Recent Changes (v2.3.0 - December 2025)

### User Management Enhancements
- **User Editing**: Complete user editing workflow with modal dialog
  - Edit button (pencil icon) on each user row
  - Editable fields: name, role, and school (when multiple organizations exist)
  - Email field is read-only
  - Form validation and error handling
  - Reactive table updates without page refresh

- **Cross-Organization User Management**: Move users between schools
  - Enhanced PUT `/api/users/:id` endpoint to support organization changes
  - Owners can move users between any organizations
  - Validates target organization exists and has available capacity

- **School Management**: Complete CRUD interface for managing schools/organizations (Owner-only)
  - New `SchoolManagement` component with full management capabilities
  - Create new schools with configurable subscription tiers and limits
  - Edit existing school details (name, tier, max students, max teachers)
  - Deactivate schools (soft delete)
  - Visual table displaying all schools with tier badges

- **School Name Visibility**: Enhanced user management with school name column
  - Users can see which school each user belongs to
  - School dropdown selector when registering new users

### Previous Major Changes (v2.0.0 - v2.2.0)
- **Multi-Tenant SaaS Architecture**: Complete transformation from single-user to multi-tenant
- **JWT Authentication**: Secure token-based auth with refresh mechanism
- **Role-Based Access Control**: owner, admin, teacher, readonly roles
- **D1 Database**: Migration from KV to SQL database for scalability
- **User Management**: Moved registration to Settings > User Management tab
- **Book Metadata Providers**: OpenLibrary and Google Books API integration

## Architecture Overview

### Current Stack
- **Frontend**: React 19 + Material-UI v7
- **Backend**: Cloudflare Workers + Hono framework
- **Database**: Cloudflare D1 (SQL) for multi-tenant data
- **Storage**: Cloudflare KV (legacy single-tenant mode)
- **Authentication**: JWT with PBKDF2 password hashing

### Key Components
- `src/worker.js` - Cloudflare Worker entry point
- `src/contexts/AppContext.js` - Central state management
- `src/routes/` - API route handlers
- `src/middleware/` - Auth, tenant, and error handling
- `src/data/` - Data provider layer (D1/KV)

## Next Steps

### Immediate
1. Continue monitoring for bugs and issues
2. Gather user feedback on new features
3. Performance optimization for large datasets

### Potential Enhancements
- Parent portal for home reading tracking
- Email notifications for reading reminders
- Advanced reporting with PDF export
- Bulk session management
- Additional AI provider integrations

## Implementation Notes

### Multi-Tenant Mode Activation
- Set `JWT_SECRET` environment variable to enable multi-tenant mode
- Without `JWT_SECRET`, app runs in legacy single-tenant KV mode

### Database Migrations
- Migrations in `migrations/` directory
- Apply locally: `npx wrangler d1 migrations apply reading-manager-db --local`
- Apply to production: `npx wrangler d1 migrations apply reading-manager-db --remote`

### API Authentication
- All internal API calls use `fetchWithAuth` from AppContext
- Automatic token refresh on 401 responses
- 60-second buffer before token expiration triggers refresh

### Role Permissions
- **Owner**: Full system access, manage all organizations and users
- **Admin**: Organization-level management, manage users within organization
- **Teacher**: Manage students, classes, and reading sessions
- **Readonly**: View-only access to data

## Files Recently Modified
- `src/components/UserManagement.js` - User editing modal
- `src/components/SchoolManagement.js` - School CRUD interface
- `src/components/SettingsPage.js` - Added School Management tab
- `src/routes/users.js` - Cross-organization user updates
- `src/routes/organization.js` - Organization CRUD endpoints

## Testing Checklist
- [x] User login/logout
- [x] User registration (via Settings)
- [x] User editing
- [x] Cross-organization user moves
- [x] School creation/editing/deactivation
- [x] Student management
- [x] Reading session recording
- [x] Book management
- [x] AI recommendations
- [x] Data export/import
