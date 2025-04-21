# Technical Context: Kids Reading Manager

## Technologies Used

### Frontend
- **React v19**: Core UI framework (updated from v18)
- **Material-UI (MUI) v7**: Component library for styling and UI elements (updated from v5)
- **Context API**: State management via AppContext with React.useMemo and React.useCallback optimizations

### Backend
- **Express.js**: API server for data storage and retrieval
- **Node.js**: Runtime environment
- **body-parser v2**: Middleware for parsing HTTP request bodies (updated from v1)
- **Hono v4.7.7**: Lightweight web framework for Cloudflare Workers
- **Cloudflare Workers**: Serverless execution environment for API endpoints

### Development Tools
- **Wrangler v4.12.0**: CLI tool for developing and deploying Cloudflare Workers
- **@rsbuild/core v1.3.9**: Build tool powered by Rspack for frontend assets

### Data Storage
- **PouchDB**: Local storage database
- **CouchDB**: Remote storage database for data synchronization
- **uuid v11**: For generating unique identifiers (updated from v9)

### Deployment
- **Docker**: Containerization for deployment
- **Docker Compose**: Multi-container orchestration
- **Nginx**: Web server and reverse proxy

## Development Setup
1. **Local Development**:
   - Node.js and npm required
   - Run `npm install` to install dependencies
   - Run `npm start` to start the development server
   - Access at http://localhost:3000

2. **Docker Deployment**:
   - Docker and Docker Compose required
   - Run `docker-compose up -d` to build and start containers
   - Access at http://your-server-ip:8080

## Technical Constraints
- Designed for up to 30 students
- Mobile-friendly interface with touch targets
- Data integrity between local and remote storage
- Persistent storage using Docker volumes
- API endpoints for CRUD operations on student data
- Performance optimizations for state management
- Material UI v7 Grid API for responsive layouts