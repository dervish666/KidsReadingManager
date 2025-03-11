# Technical Context: Kids Reading Manager

## Technologies Used

### Frontend
- **React**: Core UI framework
- **Material-UI (MUI)**: Component library for styling and UI elements
- **Context API**: State management via AppContext

### Backend
- **Express.js**: API server for data storage and retrieval
- **Node.js**: Runtime environment

### Data Storage
- **PouchDB**: Local storage database
- **CouchDB**: Remote storage database for data synchronization

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