# Build stage: Build the React application
FROM node:18-alpine AS build

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install all dependencies (including devDependencies needed for build)
RUN npm install

# Copy all source files
COPY . .

# Build the React app
RUN npm run build

# Production stage: Serve the app with Node.js/Express
FROM node:18-alpine

WORKDIR /app

# Copy package files for production dependencies
COPY package*.json ./

# Install only production dependencies
RUN npm install --production

# Copy server code
# Assuming server code is in server/index.js relative to project root
COPY server ./server

# Copy built React app from build stage
COPY --from=build /app/build ./build

# Expose the port the server will run on
EXPOSE 3000

# Command to run the server
# Ensure server/index.js is configured to listen on PORT 3000
# and serve static files from './build'
CMD ["node", "server/index.js"]