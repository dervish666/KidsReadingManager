# Kids Reading Manager - Cloudflare Deployment Guide

This guide provides comprehensive step-by-step instructions for deploying the Kids Reading Manager application to Cloudflare Workers. It covers the entire migration process from the current Node.js/Express backend with JSON file storage to a serverless architecture using Cloudflare Workers with KV storage, including serving the frontend directly from the Worker.

## Table of Contents

1. [Prerequisites and Account Setup](#1-prerequisites-and-account-setup)
2. [KV Namespace Setup](#2-kv-namespace-setup)
3. [Worker Deployment](#3-worker-deployment)
4. [Data Migration](#4-data-migration)
5. [Testing the Complete Deployment](#5-testing-the-complete-deployment)
6. [Post-Deployment Tasks](#6-post-deployment-tasks)
7. [Troubleshooting](#7-troubleshooting)
8. [Rollback Procedures](#8-rollback-procedures)

## 1. Prerequisites and Account Setup

### 1.1 Creating a Cloudflare Account

1. Visit [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) to create a new Cloudflare account if you don't already have one.
2. Verify your email address and set up your account.
3. Once logged in, note your Cloudflare Account ID from the dashboard URL (format: `https://dash.cloudflare.com/ACCOUNT_ID`).

### 1.2 Installing Wrangler CLI

Wrangler is Cloudflare's command-line tool for managing Workers and KV namespaces.

```bash
# Install Wrangler globally
npm install -g wrangler

# Verify installation
wrangler --version
```

### 1.3 Setting Up Authentication

1. Authenticate Wrangler with your Cloudflare account:

```bash
wrangler login
```

2. This will open a browser window to authorize Wrangler. Follow the prompts to complete the authentication.

3. Verify authentication:

```bash
wrangler whoami
```

### 1.4 Creating API Tokens (Optional for Advanced Usage)

For CI/CD pipelines or automated deployments, you may want to create an API token instead of using interactive login:

1. Go to the Cloudflare dashboard > Profile > API Tokens.
2. Click "Create Token".
3. Select "Create Custom Token".
4. Name your token (e.g., "Kids Reading Manager Deployment").
5. Under "Permissions", add the following:
   - Account > Workers Scripts > Edit
   - Account > Workers KV Storage > Edit
6. Under "Account Resources", select your account.
7. Click "Continue to Summary" and then "Create Token".
8. Copy and securely store the token for later use.

## 2. KV Namespace Setup

Cloudflare KV (Key-Value) is a global, low-latency key-value data store that will replace the current JSON file storage.

### 2.1 Creating the KV Namespace

1. Create a production KV namespace:

```bash
wrangler kv:namespace create READING_MANAGER_KV
```

2. Create a preview KV namespace for development:

```bash
wrangler kv:namespace create READING_MANAGER_KV --preview
```

3. Note the namespace IDs from the output. You'll see something like:
   ```
   Add the following to your wrangler.toml:
   kv_namespaces = [
     { binding = "READING_MANAGER_KV", id = "PRODUCTION_NAMESPACE_ID", preview_id = "PREVIEW_NAMESPACE_ID" }
   ]
   ```

### 2.2 Configuring the Namespace in wrangler.toml

1. Open the `wrangler.toml` file in the project root.
2. Update the KV namespace section with the IDs you received:

```toml
kv_namespaces = [
  { binding = "READING_MANAGER_KV", id = "PRODUCTION_NAMESPACE_ID", preview_id = "PREVIEW_NAMESPACE_ID" }
]
```

3. Replace `PRODUCTION_NAMESPACE_ID` and `PREVIEW_NAMESPACE_ID` with the actual IDs from the previous step.

### 2.3 Verifying KV Namespace Configuration

Verify that your KV namespace is correctly configured:

```bash
wrangler kv:namespace list
```

You should see your `READING_MANAGER_KV` namespace in the list with the correct IDs.

## 3. Worker Deployment

### 3.1 Preparing for Deployment

1. Ensure your project structure matches the expected Cloudflare Worker structure:
   - `src/index.js`: Main entry point
   - `src/routes/`: API route handlers
   - `src/services/`: Service layer (including KV service)
   - `src/middleware/`: Middleware functions
   - `src/utils/`: Utility functions

2. Verify that your `wrangler.toml` file is correctly configured for both API and frontend serving:

```toml
name = "kids-reading-manager"
main = "src/index.js"
compatibility_date = "2025-04-09"

# KV Namespace binding
kv_namespaces = [
  { binding = "READING_MANAGER_KV", id = "YOUR_PRODUCTION_NAMESPACE_ID", preview_id = "YOUR_PREVIEW_NAMESPACE_ID" }
]

# Environment variables
[vars]
ENVIRONMENT = "production"

# Development environment
[env.dev]
[env.dev.vars]
ENVIRONMENT = "development"

# Static assets configuration
[site]
bucket = "./build"
include = ["**/*"]
exclude = []

# Content types for different file extensions
[site.mimeTypes]
"js" = "application/javascript"
"css" = "text/css"
"jpg" = "image/jpeg"
"png" = "image/png"
"svg" = "image/svg+xml"
"json" = "application/json"
"html" = "text/html"
"ico" = "image/x-icon"
```

### 3.2 Building and Deploying the Integrated Worker

The Kids Reading Manager now uses an integrated approach where a single Cloudflare Worker serves both the API endpoints and the React frontend. This simplifies the deployment process and eliminates the need for a separate Cloudflare Pages deployment.

1. Deploy the Worker using the provided build-and-deploy script:

```bash
# Deploy to production
./scripts/build-and-deploy.sh

# Or deploy to development environment
./scripts/build-and-deploy.sh dev
```

This script will:
- Install dependencies
- Build the React frontend
- Deploy the Worker with the frontend assets included

Alternatively, you can perform these steps manually:

```bash
# Build the React frontend
npm run build

# Deploy to production
wrangler deploy

# Or deploy to development
wrangler deploy --env=dev
```

### 3.3 Verifying the Deployment

1. After deployment, you'll receive a URL for your Worker (e.g., `https://kids-reading-manager.workers.dev`).

2. Test the Worker's health endpoint:

```bash
curl https://kids-reading-manager.workers.dev/api/health
```

You should receive a response like:

```json
{"status":"ok","message":"Kids Reading Manager API is running","version":"1.0.0","environment":"production"}
```

3. Open the Worker URL in a browser to verify that the frontend is being served correctly.

### 3.4 Troubleshooting Common Issues

#### Issue: Deployment Fails with Authentication Error

**Solution**: Run `wrangler login` again to refresh your authentication.

#### Issue: KV Binding Error

**Solution**: Verify that the KV namespace IDs in `wrangler.toml` are correct and that the namespaces exist.

```bash
wrangler kv:namespace list
```

#### Issue: Worker Size Limit Exceeded

**Solution**: Optimize your dependencies or split your Worker into multiple Workers if necessary.

#### Issue: Static Assets Not Being Served Correctly

**Solution**: Verify that the `[site]` configuration in `wrangler.toml` is correct and that the `bucket` path points to your build directory.

## 4. Data Migration

### 4.1 Running the Migration Script

The migration script will export data from your current system and import it to Cloudflare KV.

1. Set the required environment variables:

```bash
export SOURCE_API_URL="http://your-current-api.com/api"
export KV_NAMESPACE_ID="YOUR_PRODUCTION_NAMESPACE_ID"
export CLOUDFLARE_ACCOUNT_ID="YOUR_CLOUDFLARE_ACCOUNT_ID"
export CLOUDFLARE_API_TOKEN="YOUR_CLOUDFLARE_API_TOKEN"
```

2. Run the migration script:

```bash
node scripts/migration.js
```

### 4.2 Verifying Data Integrity

1. After migration, verify that all data was correctly migrated:

```bash
# Run the API test script against your Worker
export API_URL="https://kids-reading-manager.workers.dev/api"
node scripts/test-api.js
```

2. Check that the number of students and settings match your original system.

### 4.3 Rollback Procedures if Needed

If issues are encountered during migration, follow these steps to rollback:

1. Identify the issue using the decision matrix in the rollback plan.
2. If rollback is necessary, restore the original system:

```bash
# Revert DNS changes if made
# Restore data from backup if needed
cp /backups/pre_migration_app_data.json /config/app_data.json

# Restart the original application
docker-compose up -d
```

For a complete rollback procedure, refer to the [Rollback Plan](#8-rollback-procedures) section.

## 5. Testing the Complete Deployment

### 5.1 Verifying API Endpoints

1. Test all API endpoints using the provided test script:

```bash
export API_URL="https://kids-reading-manager.workers.dev/api"
node scripts/test-api.js
```

2. Manually test critical endpoints:

```bash
# Get all students
curl https://kids-reading-manager.workers.dev/api/students

# Get settings
curl https://kids-reading-manager.workers.dev/api/settings
```

### 5.2 Testing Frontend Functionality

1. Open your Worker URL (e.g., `https://kids-reading-manager.workers.dev`) in a browser.
2. Test the following critical functionality:
   - Adding a new student
   - Recording a reading session
   - Viewing student details
   - Updating settings
   - Importing/exporting data

3. Test on multiple devices and browsers to ensure responsive design works correctly.

### 5.3 Performance Testing

1. Use browser developer tools to measure load times and identify any performance issues.
2. Compare performance metrics with the original application:
   - Time to First Byte (TTFB)
   - First Contentful Paint (FCP)
   - API response times

3. Document any significant performance differences.

## 6. Post-Deployment Tasks

### 6.1 Setting Up Custom Domains (Optional)

1. In the Cloudflare dashboard, go to Workers & Pages > your Worker > Triggers > Custom Domains.
2. Click "Add Custom Domain".
3. Enter your domain name (e.g., `reading-manager.yourdomain.com`).
4. Follow the instructions to verify domain ownership and configure DNS.

Alternatively, you can configure custom domains in your `wrangler.toml`:

```toml
[routes]
pattern = "*"
zone_name = "yourdomain.com"
custom_domain = "reading-manager.yourdomain.com"
```

Then redeploy the Worker:

```bash
./scripts/build-and-deploy.sh
```

### 6.2 Configuring Caching and Security Settings

1. In the Cloudflare dashboard, go to your domain's overview.
2. Configure caching rules:
   - Go to Caching > Configuration.
   - Set Browser Cache TTL to a reasonable value (e.g., 4 hours).
   - Enable Auto Minify for HTML, CSS, and JavaScript.

3. Configure security settings:
   - Go to Security > Settings.
   - Set Security Level to "Medium" or "High".
   - Enable Bot Fight Mode to protect against bot traffic.
   - Consider enabling Web Application Firewall (WAF) for additional protection.

### 6.3 Monitoring and Analytics

1. Set up Cloudflare Analytics:
   - In the Cloudflare dashboard, go to Analytics & Logs.
   - Review Web Analytics for your site.
   - Review Workers Analytics for your API.

2. Consider setting up additional monitoring:
   - Set up Cloudflare Workers Alerts for error rates and CPU time.
   - Configure notification channels (email, Slack, etc.).

3. Implement logging:
   - Use the Cloudflare Workers logging API to log important events.
   - Consider setting up log drains to external logging services.

## 7. Troubleshooting

### 7.1 Common Issues and Solutions

#### CORS Errors

**Issue**: Frontend cannot access the API due to CORS restrictions.

**Solution**: Verify that the CORS configuration in your Worker is correct:

```javascript
app.use('*', cors({
  origin: ['https://kids-reading-manager.workers.dev', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
}));
```

#### KV Storage Limits

**Issue**: Hitting KV storage limits or performance issues with large datasets.

**Solution**: 
- Optimize your data structure to reduce size.
- Consider implementing pagination for large collections.
- Use caching strategies to reduce KV reads.

#### Worker CPU Time Limits

**Issue**: Worker timing out due to exceeding CPU time limits.

**Solution**:
- Optimize your code to reduce computation time.
- Split complex operations into multiple requests if possible.
- Consider using Durable Objects for more complex operations.

#### Static Asset Serving Issues

**Issue**: Static assets not being served correctly or 404 errors for frontend routes.

**Solution**:
- Verify that the `[site]` configuration in `wrangler.toml` is correct.
- Check that the MIME types are properly configured.
- Ensure that the React build process completed successfully before deployment.
- Verify that the Worker is correctly handling client-side routing by serving `index.html` for unknown routes.

#### Hono Serve-Static Issues

**Issue**: Problems with Hono's `serveStatic` middleware.

**Solution**:
- Instead of using Hono's `serveStatic` middleware, rely on Cloudflare Workers' built-in static asset serving capabilities through the `[site]` configuration in `wrangler.toml`.
- This approach is more efficient and avoids compatibility issues with Hono's middleware.

### 7.2 Debugging Techniques

1. Enable verbose logging in your Worker:

```javascript
console.log('Detailed debug information:', { request, context, data });
```

2. Use the Cloudflare dashboard to view Worker logs:
   - Go to Workers & Pages > Your worker > Logs.
   - Filter logs by status code, method, or custom filters.

3. Test API endpoints directly using curl or Postman to isolate frontend vs. backend issues.

4. For frontend issues, use browser developer tools to:
   - Check for JavaScript errors in the console
   - Inspect network requests
   - Verify that static assets are being loaded correctly

## 8. Rollback Procedures

If critical issues are encountered after deployment, follow these procedures to rollback to the original system.

### 8.1 Decision Matrix for Rollback

| Issue Category | Severity | Example | Rollback Decision |
|----------------|----------|---------|-------------------|
| **Functionality** | Critical | Core features not working | Immediate rollback |
| **Functionality** | High | Secondary features degraded | Assess fix timeline, rollback if >24h |
| **Functionality** | Medium | Minor UI issues | Fix forward, no rollback |
| **Performance** | Critical | Response times >10x baseline | Immediate rollback |
| **Performance** | High | Response times 2-10x baseline | Assess fix timeline, rollback if >24h |
| **Performance** | Medium | Response times <2x baseline | Fix forward, no rollback |
| **Data Integrity** | Critical | Data loss or corruption | Immediate rollback |
| **Data Integrity** | High | Inconsistent data state | Assess fix timeline, rollback if >12h |

### 8.2 DNS Rollback

If you've configured custom domains, revert DNS settings to point back to the original server:

```bash
# Example using Cloudflare API
export CLOUDFLARE_API_TOKEN="your-api-token"
export CLOUDFLARE_ZONE_ID="your-zone-id"

# Get current DNS record ID
RECORD_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records?name=kids-reading-manager.example.com" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" | jq -r '.result[0].id')

# Update DNS record to point back to original server
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records/$RECORD_ID" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"content":"ORIGINAL_SERVER_IP","ttl":60}'
```

### 8.3 Data Restoration

If data needs to be restored to the original system:

```bash
# Stop the application to prevent writes during restoration
docker-compose stop app

# Backup the current data file (just in case)
cp /config/app_data.json /config/app_data.json.migration_backup

# Restore the pre-migration backup
cp /backups/pre_migration_app_data.json /config/app_data.json

# Restart the application
docker-compose start app
```

### 8.4 Handling Data Created During Migration

If new data was created during the migration period, merge it back into the original system:

1. Export data from Cloudflare KV:

```bash
wrangler kv:key get --binding=READING_MANAGER_KV "app_data" > cloudflare_app_data.json
```

2. Use the provided script to identify and import new/modified records:

```bash
node scripts/identify-new-records.js
```

3. Import the new data into the original system:

```bash
# Import new students via API
curl -X POST http://localhost:3000/api/students/bulk \
  -H "Content-Type: application/json" \
  -d @new_students.json
```

## Conclusion

This deployment guide provides a comprehensive approach to migrating the Kids Reading Manager application to Cloudflare Workers with integrated frontend serving. By following these steps, you can successfully deploy both the backend and frontend components from a single Worker, migrate your data, and ensure the application continues to function correctly in its new serverless environment.

The integrated approach offers several benefits:
- Simplified architecture with a single deployment
- Reduced costs by eliminating the need for separate services
- Improved performance with reduced network hops
- Elimination of CORS issues since everything is served from the same domain

Remember to thoroughly test all functionality after deployment and monitor performance and errors to quickly identify and address any issues that may arise.

For any questions or issues not covered in this guide, please refer to the [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/) or contact the development team.