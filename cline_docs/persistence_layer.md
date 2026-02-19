# Persistence Layer Architecture

## Overview

The Tally Reading application now supports a flexible persistence layer that allows seamless switching between different data storage mechanisms. This design enables the application to use Cloudflare KV for production deployments while maintaining JSON file-based storage for local development.

## Architecture

### Design Pattern

The architecture follows a provider pattern where data access functions are abstracted through provider modules:

```
┌─────────────────┐    ┌─────────────────────┐    ┌────────────────────┐
│   API Endpoints │────│   Data Provider      │────│ actual implementation │
│                 │    │   (Interface)        │    │                    │
│ - /api/books    │    │                     │    │  - jsonProvider     │
│ - /api/students │    │ - getAllBooks()     │    │    (JSON file)      │
│                 │    │ - getBookById()     │    └────────────────────┘
└─────────────────┘    │ - addBook()         │
                      │ - updateBook()       │    ┌────────────────────┐
                      │ - deleteBook()       │────│  - kvProvider       │
                      └─────────────────────┘    │    (Cloudflare KV)   │
                                                 └────────────────────┘
```

### Environment Detection

The system automatically detects the appropriate storage mechanism based on:

1. **Explicit Configuration**: `STORAGE_TYPE` environment variable
   - `STORAGE_TYPE=kv` → Uses Cloudflare KV
   - `STORAGE_TYPE=json` → Uses JSON files

2. **Auto-Detection**: Falls back to environment detection
   - Worker environment with `READING_MANAGER_KV` → Cloudflare KV
   - Node.js environment → JSON files

### Environment Configuration

#### Production (Cloudflare Workers)
In `wrangler.toml`:
```toml
[vars]
STORAGE_TYPE = "kv"
ENVIRONMENT = "production"
```

#### Development (Workers)
In `wrangler.toml`:
```toml
[env.dev.vars]
STORAGE_TYPE = "json"
ENVIRONMENT = "development"
```

#### Local Development (Node.js)
In `.env`:
```bash
STORAGE_TYPE=json
```

## Provider Implementations

### JSON Provider (`src/data/jsonProvider.js`)

- **Purpose**: File-based storage for local development
- **Storage Location**: `config/app_data.json`
- **Operations**: Synchronous file system operations
- **Best For**: Local development, testing, data import/export

### KV Provider (`src/data/kvProvider.js`)

- **Purpose**: Cloudflare Workers KV storage for production
- **Storage Location**: `READING_MANAGER_KV` namespace
- **Operations**: Asynchronous KV API calls
- **Best For**: Production deployments, scalable distributed storage

## Data Access Functions

Both providers implement the same interface:

```javascript
// Get all books
getAllBooks() → Promise<Array<Book>>

// Get specific book by ID
getBookById(id: string) → Promise<Book|null>

// Add new book
addBook(book: BookData) → Promise<Book>

// Update existing book
updateBook(id: string, bookData: BookData) → Promise<Book>

// Delete book
deleteBook(id: string) → Promise<Book|null>
```

## Usage Examples

### For Workers (Using KV)
```javascript
import { createProvider } from '../data/index.js';

const dataProvider = createProvider(env);
const books = await dataProvider.getAllBooks();
```

### For Node.js (Using JSON)
```javascript
import { createProvider } from './src/data/index.js';

const dataProvider = createProvider();
const books = await dataProvider.getAllBooks();
```

## Files Created

- `src/data/index.js` - Provider factory and conditional exports
- `src/data/jsonProvider.js` - JSON file-based implementation
- `src/data/kvProvider.js` - Cloudflare KV implementation
- `src/routes/books.js` - Book API routes for Workers
- Updated `src/services/kvService.js` - Added book functions

## Switching Storage Types

To switch storage mechanisms:

1. **Set Environment Variable**:
   ```bash
   export STORAGE_TYPE=kv    # Use KV
   export STORAGE_TYPE=json  # Use JSON
   ```

2. **Restart Application**: The change takes effect on next startup

3. **For Workers**: Update `wrangler.toml` and redeploy
   ```toml
   # Production: KV
   [vars]
   STORAGE_TYPE = "kv"

   # Development: JSON
   [env.dev.vars]
   STORAGE_TYPE = "json"
   ```

## Data Migration

When switching from JSON to KV:

1. Export data from JSON storage
2. Import data through the `/api/data` endpoint in KV environment
3. Verify data integrity
4. Update application to use KV

## Future Extensibility

The provider pattern makes it easy to add new storage mechanisms:

1. Create new provider module (e.g., `postgresqlProvider.js`)
2. Implement the standard interface functions
3. Add detection logic to `index.js`
4. Update environment configuration

## Error Handling

Both providers include comprehensive error handling:

- **JSON Provider**: File system errors, JSON parsing errors
- **KV Provider**: Network failures, KV API errors, quota exceeded

Errors are propagated with meaningful messages to help with debugging.

## Performance Considerations

- **KV Provider**: Ideal for distributed deployments, automatic scaling
- **JSON Provider**: Fast for local development, but limited by file system
- **Caching**: Consider implementing caching strategies for frequently accessed data

## Monitoring

Monitor storage performance using:

- KV API response times
- File I/O operations
- Data consistency checks
- Error rates and patterns

This architecture provides a solid foundation for scalable data management while maintaining development flexibility.