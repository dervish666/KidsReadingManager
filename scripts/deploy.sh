#!/bin/bash

# Deployment script for Tally Reading Cloudflare Worker
# This script deploys the Worker to Cloudflare and updates the KV namespace bindings

# Exit on error
set -e

# Configuration
ENVIRONMENT=${1:-production}
WORKER_NAME="kids-reading-manager"
KV_NAMESPACE="READING_MANAGER_KV"

echo "Deploying Tally Reading Worker to $ENVIRONMENT environment..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "Error: wrangler is not installed. Please install it with 'npm install -g wrangler'"
    exit 1
fi

# Check if logged in to Cloudflare
echo "Checking Cloudflare authentication..."
if ! wrangler whoami &> /dev/null; then
    echo "Not logged in to Cloudflare. Please run 'wrangler login' first."
    exit 1
fi

# Check if KV namespace IDs are set in wrangler.toml
echo "Checking KV namespace configuration..."
if grep -q "your-kv-namespace-id-here" wrangler.toml; then
    echo "Error: KV namespace IDs are not set in wrangler.toml"
    echo "Please create KV namespaces and update wrangler.toml with the IDs:"
    echo "  1. wrangler kv:namespace create READING_MANAGER_KV"
    echo "  2. wrangler kv:namespace create READING_MANAGER_KV --preview"
    echo "  3. Update wrangler.toml with the namespace IDs"
    exit 1
fi

# Build and deploy
echo "Building and deploying Worker..."
if [ "$ENVIRONMENT" = "production" ]; then
    wrangler deploy
else
    wrangler deploy --env="$ENVIRONMENT"
fi

echo "Deployment completed successfully!"
echo "Worker URL: https://$WORKER_NAME.$ENVIRONMENT.workers.dev"

# Provide instructions for frontend configuration
echo ""
echo "Next steps:"
echo "1. Update your frontend to use the new API URL: https://$WORKER_NAME.$ENVIRONMENT.workers.dev/api"
echo "2. Run the migration script to transfer data: npm run migrate"
echo ""

exit 0