# Cloudflare Worker Frontend Serving

This document explains how the Cloudflare Worker has been configured to serve both the API endpoints and the React frontend from a single deployment.

## Overview

The Tally Reading application now uses a single Cloudflare Worker to:
1. Serve API endpoints at `/api/*` paths
2. Serve the React frontend static files for all other paths

This approach simplifies the deployment architecture by eliminating the need for a separate Cloudflare Pages deployment, reducing complexity and potential points of failure.

## Implementation Details

### Worker Configuration

The Cloudflare Worker has been configured to:

1. **Handle API Requests**: All requests to `/api/*` paths are routed to the appropriate API handlers.
2. **Serve Static Assets**: Static files from the React build (JS, CSS, images, etc.) are served with appropriate content types.
3. **Support Client-Side Routing**: Any path that doesn't match a static file or API endpoint serves the `index.html` file to support React Router.

### Key Components

1. **Updated Worker Entry Point (`src/index.js`)**:
   - Uses Hono's `serveStatic` middleware to serve static files
   - Implements a catch-all route for client-side routing
   - Maintains all existing API functionality

2. **Wrangler Configuration (`wrangler.toml`)**:
   - Added `[site]` configuration to specify the static assets directory
   - Configured MIME types for different file extensions
   - Maintained existing KV namespace bindings

3. **Build and Deploy Script (`scripts/build-and-deploy.sh`)**:
   - Builds the React frontend
   - Deploys the Worker with the frontend assets included

## How It Works

1. When a request comes in to the Worker:
   - If the path starts with `/api/`, it's handled by the API routes
   - If the path matches a static asset (e.g., `/static/js/main.js`), the file is served directly
   - For all other paths, `index.html` is served to allow React Router to handle client-side routing

2. This approach ensures that:
   - API requests are processed correctly
   - Static assets are served efficiently with proper caching
   - Single-page application routing works as expected

## Deployment Process

To deploy the application with both the API and frontend:

1. Run the build and deploy script:
   ```bash
   npm run build:deploy
   ```

   For development environment:
   ```bash
   npm run build:deploy:dev
   ```

2. The script will:
   - Build the React frontend using `npm run build`
   - Deploy the Worker with the frontend assets using Wrangler

## Benefits

1. **Simplified Architecture**: Single deployment for both frontend and API
2. **Reduced Costs**: Only one Worker instance needed
3. **Improved Performance**: Reduced network hops between frontend and API
4. **Easier Maintenance**: Single codebase and deployment process
5. **Consistent Domain**: Both frontend and API served from the same domain, eliminating CORS issues

## Considerations

1. **Worker Size Limits**: Cloudflare Workers have a size limit (currently 1MB for the bundled Worker code). If the application grows significantly, you may need to optimize the bundle size or consider alternative approaches.

2. **Cache Control**: Consider implementing cache control headers for static assets to improve performance and reduce Worker CPU usage.

3. **Custom Domains**: If using a custom domain, ensure the DNS records are properly configured to point to the Worker.