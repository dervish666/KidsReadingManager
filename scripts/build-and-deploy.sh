#!/bin/bash
# build-and-deploy.sh
#
# This script builds the React frontend and deploys the Cloudflare Worker
# with the frontend assets included. The Worker is configured to serve
# both the API endpoints at /api/* and the React frontend for all other paths.

set -e  # Exit immediately if a command exits with a non-zero status

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting build and deployment process...${NC}"

# Check if environment is specified
ENVIRONMENT=${1:-"production"}
if [ "$ENVIRONMENT" != "production" ] && [ "$ENVIRONMENT" != "dev" ]; then
  echo -e "${RED}Invalid environment: $ENVIRONMENT. Must be 'production' or 'dev'.${NC}"
  exit 1
fi

ENV_FLAG=""
if [ "$ENVIRONMENT" == "dev" ]; then
  ENV_FLAG="--env=dev"
fi

# Step 1: Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install

# Step 2: Build the React frontend
echo -e "${YELLOW}Building React frontend...${NC}"
REACT_APP_API_BASE_URL="https://kids-reading-manager.workers.dev/api" npm run build

# Check if build was successful
if [ ! -d "build" ]; then
  echo -e "${RED}Build failed: 'build' directory not found.${NC}"
  exit 1
fi

echo -e "${GREEN}React build completed successfully.${NC}"

# Step 3: Verify the build directory
echo -e "${YELLOW}Verifying build directory...${NC}"
if [ -f "build/index.html" ]; then
  echo -e "${GREEN}✓ Found index.html${NC}"
else
  echo -e "${RED}Error: build/index.html not found. Build may have failed.${NC}"
  exit 1
fi

# Step 4: Install Wrangler dependencies if needed
echo -e "${YELLOW}Checking Wrangler dependencies...${NC}"
if ! command -v wrangler &> /dev/null; then
  echo -e "${YELLOW}Installing Wrangler globally...${NC}"
  npm install -g wrangler
fi

# Step 5: Deploy to Cloudflare Workers
echo -e "${YELLOW}Deploying to Cloudflare Workers ($ENVIRONMENT environment)...${NC}"
echo -e "${YELLOW}This will deploy both the API and the frontend...${NC}"
wrangler deploy $ENV_FLAG

# Step 4: Verify deployment
if [ $? -eq 0 ]; then
  echo -e "${GREEN}Deployment completed successfully!${NC}"
  echo -e "${GREEN}Your application is now available at:${NC}"
  
  if [ "$ENVIRONMENT" == "production" ]; then
    echo -e "${GREEN}https://kids-reading-manager.workers.dev${NC}"
  else
    echo -e "${GREEN}https://kids-reading-manager.dev.workers.dev${NC}"
  fi
  
  echo -e "${YELLOW}Note: It may take a few minutes for the changes to propagate.${NC}"
else
  echo -e "${RED}Deployment failed. Please check the error messages above.${NC}"
  exit 1
fi

echo -e "${GREEN}Build and deployment process completed.${NC}"