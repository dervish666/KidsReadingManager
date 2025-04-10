# Kids Reading Manager - Cloudflare Workers Implementation

This project implements the Kids Reading Manager application using Cloudflare Workers and KV storage. It provides a serverless backend API and serves the React frontend from a single Worker, replacing the previous Express.js server.

## Project Structure

```
/
├── src/                      # Source code
│   ├── index.js              # Main Worker entry point
│   ├── routes/               # API route handlers
│   │   ├── students.js       # Student endpoints
│   │   ├── settings.js       # Settings endpoints
│   │   └── data.js           # Data import/export endpoints
│   ├── middleware/           # Middleware functions
│   │   └── errorHandler.js   # Error handling middleware
│   ├── services/             # Service layer
│   │   └── kvService.js      # KV storage service
│   └── utils/                # Utility functions
│       ├── validation.js     # Request validation
│       └── helpers.js        # Helper functions
├── scripts/                  # Utility scripts
│   ├── migration.js          # Data migration script
│   └── build-and-deploy.sh   # Frontend build and deployment script
├── build/                    # React frontend build output (generated)
├── public/                   # Static assets for React frontend
├── package.json              # Project dependencies
└── wrangler.toml             # Cloudflare Workers configuration
```

## API Endpoints

The API implements the following endpoints:

### Students

- `GET /api/students` - Get all students
- `POST /api/students` - Add a new student
- `PUT /api/students/:id` - Update a student
- `DELETE /api/students/:id` - Delete a student
- `POST /api/students/bulk` - Bulk import students

### Settings

- `GET /api/settings` - Get application settings
- `POST /api/settings` - Update application settings

### Data Import/Export

- `GET /api/data` - Get all data (for import/export)
- `POST /api/data` - Replace all data (for import/export)

## Data Model

The application uses a single KV namespace with a primary key `app_data` that stores the entire application state as a JSON document:

```json
{
  "students": [
    {
      "id": "uuid-1",
      "name": "Student Name",
      "lastReadDate": "2025-04-01",
      "readingSessions": [
        {
          "id": "session-uuid-1",
          "date": "2025-04-01",
          "assessment": "Level 3",
          "notes": "Good progress"
        }
      ]
    }
  ],
  "settings": {
    "readingStatusSettings": {
      "recentlyReadDays": 14,
      "needsAttentionDays": 21
    }
  },
  "metadata": {
    "lastUpdated": "2025-04-09T17:00:00Z",
    "version": "1.0"
  }
}
```

## Setup and Deployment

### Prerequisites

- Node.js and npm
- Cloudflare account
- Wrangler CLI (`npm install -g wrangler`)

### Configuration

1. Log in to Cloudflare using Wrangler:
   ```
   wrangler login
   ```

2. Create KV namespaces (this is required before deployment):
   ```
   wrangler kv:namespace create READING_MANAGER_KV
   wrangler kv:namespace create READING_MANAGER_KV --preview
   ```
   
   After running these commands, Wrangler will output the namespace IDs, like:
   ```
   ✨ Created namespace "READING_MANAGER_KV" (id: 12345abcdef)
   ```

3. Update the `wrangler.toml` file with your KV namespace IDs:
   ```toml
   kv_namespaces = [
     { binding = "READING_MANAGER_KV", id = "12345abcdef", preview_id = "67890ghijk" }
   ]
   ```
   
   Replace `12345abcdef` with your production namespace ID and `67890ghijk` with your preview namespace ID.

5. If you're using a custom domain, update the routes configuration in `wrangler.toml`:
   ```toml
   routes = [
     { pattern = "/api/*", zone_name = "yourdomain.com" }
   ]
   ```
   
   Replace `yourdomain.com` with your Cloudflare zone name. If you're using the default workers.dev domain, you can remove or comment out the routes section.

### Development

1. Install dependencies:
   ```
   npm install
   ```

2. Start the development server:
   ```
   npm run dev
   ```

### Migration

To migrate data from the existing system to Cloudflare KV:

1. Set the required environment variables:
   ```
   export SOURCE_API_URL=http://your-current-api-url
   export KV_NAMESPACE_ID=your-kv-namespace-id
   export CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id
   export CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
   ```

2. Run the migration script:
   ```
   npm run migrate
   ```

### Deployment

#### API Only Deployment

Deploy only the API to Cloudflare Workers:

```
npm run deploy
```

#### Full Application Deployment (API + Frontend)

Build the React frontend and deploy it along with the API:

```
npm run build:deploy
```

For development environment:

```
npm run build:deploy:dev
```

This will:
1. Build the React frontend
2. Deploy the Worker with the frontend assets included
3. Configure the Worker to serve both the API and frontend

See the [Cloudflare Frontend Serving](./cline_docs/cloudflare_frontend_serving.md) documentation for more details on how the frontend serving works.

## License

This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 (CC BY-NC 4.0) license.