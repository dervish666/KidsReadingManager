# Installation and Setup Instructions

## Easiest Way to Deploy: Cloudflare Workers

The quickest and simplest way to get your own copy of this application running is by deploying it directly to Cloudflare Workers. Cloudflare offers a generous free tier that should be sufficient for most personal use cases.

<a target="_blank" href="https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fdervish666%2FKidsReadingManager">
  <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare">
</a>

**(You will need a GitHub and Cloudflare account, both are free).** Clicking this button will guide you through the setup process.

---

## Technical Overview (Cloudflare Workers Implementation)

This project implements the Kids Reading Manager application using Cloudflare Workers and KV storage. It provides a serverless backend API and serves the React frontend from a single Worker. This approach replaces the previous Express.js server implementation for a more streamlined, serverless architecture.

## Project Structure

```
/
├── src/                      # Source code for the Cloudflare Worker & React App
│   ├── index.js              # Main Worker entry point (handles API and serves frontend)
│   ├── worker.js             # Worker logic (might be merged with index.js depending on setup)
│   ├── App.js                # Main React application component
│   ├── components/           # React UI components
│   ├── contexts/             # React Context API providers
│   ├── routes/               # API route handlers (within the Worker)
│   │   ├── students.js       # Student endpoints
│   │   ├── settings.js       # Settings endpoints
│   │   └── data.js           # Data import/export endpoints
│   ├── middleware/           # Worker middleware functions
│   │   └── errorHandler.js   # Error handling middleware
│   ├── services/             # Service layer (e.g., interacting with KV)
│   │   └── kvService.js      # KV storage service
│   └── utils/                # Utility functions
│       ├── validation.js     # Request validation
│       └── helpers.js        # Helper functions
├── public/                   # Static assets for React frontend (index.html, css, images)
├── build/                    # React frontend build output (generated, served by Worker)
├── scripts/                  # Utility scripts
│   ├── migration.js          # Data migration script (if needed)
│   └── build-and-deploy.sh   # Example frontend build and deployment script
├── server/                   # (Potentially legacy) Previous server code, if kept for reference
├── cline_docs/               # Documentation generated during development
├── package.json              # Project dependencies and scripts
├── wrangler.toml             # Cloudflare Workers configuration
└── README.md                 # This file
```

## API Endpoints

The backend API (served by the Cloudflare Worker) implements the following endpoints:

### Students

- `GET /api/students` - Get all students
- `POST /api/students` - Add a new student
- `PUT /api/students/:id` - Update a student
- `DELETE /api/students/:id` - Delete a student
- `POST /api/students/bulk` - Bulk import students

### Classes

- `GET /api/classes` - Get all classes
- `POST /api/classes` - Add a new class
- `PUT /api/classes/:id` - Update a class
- `DELETE /api/classes/:id` - Delete a class

### Books and Genres

- `GET /api/books` - Get all books
- `POST /api/books` - Add a new book
- `PUT /api/books/:id` - Update a book
- `DELETE /api/books/:id` - Delete a book
- `GET /api/genres` - Get all genres
- `POST /api/genres` - Add a new genre
- `PUT /api/genres/:id` - Update a genre
- `DELETE /api/genres/:id` - Delete a genre

### AI-Powered Recommendations

- `GET /api/books/recommendations?studentId={id}` - Get personalized book recommendations for a student

### Settings

- `GET /api/settings` - Get application settings
- `POST /api/settings` - Update application settings

### Data Import/Export

- `GET /api/data` - Get all data (for backup/export)
- `POST /api/data` - Replace all data (for restore/import)
- `GET /api/data/json` - Get raw JSON content
- `POST /api/data/save-json` - Save JSON content directly

### Analytics

- `POST /api/analytics/event` - Log analytics events
- `POST /api/analytics/track/page_view` - Track page views

## Data Model (Cloudflare KV)

The application uses Cloudflare KV storage. The entire application state is stored as a single JSON object under a specific key (e.g., `app_data`) within a KV namespace.

Enhanced data structure:

```json
{
  "students": [
    {
      "id": "uuid-1",
      "name": "Student Name",
      "classId": "class-uuid-1",
      "lastReadDate": "2025-04-01",
      "readingLevel": "Level 3",
      "preferences": {
        "favoriteGenreIds": ["genre-1", "genre-2"],
        "likes": ["adventure stories", "animals"],
        "dislikes": ["scary stories"],
        "readingFormats": ["picture books", "chapter books"]
      },
      "readingSessions": [
        {
          "id": "session-uuid-1",
          "date": "2025-04-01",
          "bookId": "book-uuid-1",
          "bookTitle": "Book Title",
          "author": "Author Name",
          "assessment": "Level 3",
          "notes": "Good progress",
          "environment": "school" // or "home"
        }
      ]
    }
    // ... more students
  ],
  "classes": [
    {
      "id": "class-uuid-1",
      "name": "Year 3 Robins",
      "teacherName": "Ms. Smith",
      "disabled": false,
      "createdAt": "2025-04-01T10:00:00Z",
      "updatedAt": "2025-04-01T10:00:00Z"
    }
  ],
  "books": [
    {
      "id": "book-uuid-1",
      "title": "The Magic Tree House",
      "author": "Mary Pope Osborne",
      "genreIds": ["genre-1", "genre-2"],
      "readingLevel": "Level 2-3",
      "ageRange": "6-9"
    }
  ],
  "genres": [
    {
      "id": "genre-uuid-1",
      "name": "Adventure",
      "description": "Exciting stories with action and exploration"
    }
  ],
  "settings": {
    "readingStatusSettings": {
      "recentlyReadDays": 14,
      "needsAttentionDays": 21
    }
  },
  "metadata": {
    "lastUpdated": "2025-04-10T15:00:00Z",
    "version": "2.0"
  }
}
```

## Manual Setup and Deployment (Advanced)

If you prefer not to use the "Deploy to Cloudflare" button or want more control, follow these steps:

### Prerequisites

- Node.js and npm (or yarn)
- Cloudflare account
- Wrangler CLI (`npm install -g wrangler`)

### Configuration

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/dervish666/KidsReadingManager.git
    cd KidsReadingManager
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Log in to Cloudflare via Wrangler:**
    ```bash
    wrangler login
    ```
4.  **Create KV Namespace:** A KV namespace is needed to store the application data.
    ```bash
    # Create for production
    wrangler kv:namespace create READING_MANAGER_KV
    # Create for local development/preview
    wrangler kv:namespace create READING_MANAGER_KV --preview
    ```
    Wrangler will output the `id` for the production namespace and the `preview_id` for the preview namespace.

5.  **Update `wrangler.toml`:** Open the `wrangler.toml` file and add/update the `kv_namespaces` section with the IDs obtained in the previous step:
    ```toml
    # Example wrangler.toml snippet
    kv_namespaces = [
      { binding = "READING_MANAGER_KV", id = "YOUR_PRODUCTION_NAMESPACE_ID", preview_id = "YOUR_PREVIEW_NAMESPACE_ID" }
    ]
    ```
    Replace the placeholder IDs with your actual IDs.

6.  **(Optional) Custom Domain:** If you plan to use a custom domain registered with Cloudflare, configure the `routes` in `wrangler.toml`. Otherwise, you can remove or comment out the `routes` section to use the default `*.workers.dev` domain.
    ```toml
    # Example for custom domain
    # routes = [
    #   { pattern = "your-reading-app.yourdomain.com/*", zone_name = "yourdomain.com" }
    # ]
    ```

### Local Development

1.  **Start the development server:** This command uses Wrangler to simulate the Cloudflare environment locally, including KV access (using the preview namespace).
    ```bash
    npm run dev
    # or potentially: wrangler dev src/index.js --local --kv READING_MANAGER_KV
    ```
    Access the application at `http://localhost:8787` (or the port specified by Wrangler).

### Alternative Local Development (Express Server)

For local development with the Express server:

1. **Start the development server:**
   ```bash
   npm run start
   ```
   Access the application at `http://localhost:3000`.

### Migration (If applicable)

If you have data from a previous version or another system:

1.  Examine the `scripts/migration.js` script (if it exists and is relevant).
2.  You might need to set environment variables like `SOURCE_API_URL`, `KV_NAMESPACE_ID`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`.
3.  Run the migration script:
    ```bash
    npm run migrate
    ```
    *Note: Adapt the script and process based on your specific migration needs.*

### Deployment

This project combines the backend API and the React frontend into a single Cloudflare Worker deployment.

1.  **Build the React Frontend:**
    ```bash
    npm run build
    ```
    This creates an optimized production build in the `build/` directory.

2.  **Deploy using Wrangler:**
    ```bash
    npm run deploy # Usually configured in package.json to run 'wrangler deploy'
    # or directly:
    # wrangler deploy src/index.js
    ```
    Wrangler bundles the worker script and uploads the static assets from the `build` directory (if configured in `wrangler.toml` under `[site]`).

    *Refer to `package.json` scripts (`deploy`, `build:deploy`, etc.) and `wrangler.toml` for the exact build and deployment commands configured for this project.*

See the [Cloudflare Frontend Serving](./cline_docs/cloudflare_frontend_serving.md) documentation for more details on how the frontend serving works within the Worker.

## Environment Variables

For AI-powered book recommendations, you'll need:
- `ANTHROPIC_API_KEY`: Required for AI-powered recommendations

## Troubleshooting

### Common Issues

1. **KV Namespace Issues**: Ensure your KV namespace IDs are correctly configured in `wrangler.toml`
2. **API Key Issues**: Verify your Anthropic API key is set correctly for recommendations
3. **Build Issues**: Try clearing node_modules and reinstalling dependencies

### Getting Help

- Check the [documentation](./cline_docs/) for detailed technical information
- Review the [app overview](./cline_docs/app_overview.md) for architectural details
- Consult the [product context](./cline_docs/productContext.md) for feature explanations