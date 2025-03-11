# Kids Reading Manager

A mobile-friendly web application for tracking reading sessions with primary school children.

## Features

- Track reading sessions for up to 30 children
- Record weekly reading sessions with date tracking
- Simple assessment system (struggling, needs help, independent)
- Visual indicators showing which children haven't been read with recently
- Statistics on reading frequency per child
- Local storage for data persistence
- Clean, touch-friendly interface optimized for mobile use
- Quick-entry mode for efficiently logging multiple children
- Notes for each reading session
- Export functionality to share data with teachers

## Getting Started

### Prerequisites

- Node.js and npm installed on your computer (for development)
- Docker and Docker Compose (for deployment)

### Development Installation

1. Clone this repository or download the source code
2. Navigate to the project directory
3. Install dependencies:

```bash
npm install
```

4. Start the development server:

```bash
npm start
```

5. Open your browser and navigate to `http://localhost:3000`

### Docker Deployment on Unraid

#### Option 1: Using Docker Compose (Recommended)

1. Clone this repository on your Unraid server
2. Navigate to the project directory
3. Build and start the containers:

```bash
docker-compose up -d
```

4. Access the application at `http://your-unraid-ip:8080`

This method automatically sets up:
- The frontend web application
- The backend API server
- A persistent volume for data storage

#### Option 2: Using Unraid Docker UI

1. In the Unraid web UI, go to the Docker tab
2. You'll need to create two containers:
   
   **Frontend Container:**
   - Repository: `localhost/kids-reading-manager:latest` (after building locally)
   - Network Type: Bridge
   - Port Mappings: `8080:80`
   - Name: kids-reading-manager
   
   **API Server Container:**
   - Repository: `localhost/kids-reading-manager-api:latest` (after building locally)
   - Network Type: Bridge
   - Port Mappings: `3001:3001`
   - Name: kids-reading-manager-api
   - Volumes: Add a path mapping for `/data` to a persistent location on your Unraid server

3. Make sure both containers are on the same network

#### Building the Docker Images

If you want to build the Docker images locally:

```bash
# Build the frontend image
docker build -t kids-reading-manager:latest .

# Build the API server image
docker build -f Dockerfile.server -t kids-reading-manager-api:latest .
```

You can then push these to a registry or use them directly on your Unraid server.

## Usage

### Initial Setup

1. When you first open the app, you'll be prompted to add students
2. You can add students individually or use the "Bulk Import" feature to add multiple students at once
3. Enter each student's name on a new line in the bulk import dialog

### Recording Reading Sessions

1. Navigate to the "Reading" tab
2. Choose between "Standard" mode for detailed entries or "Quick Entry" mode for rapid logging
3. In Standard mode:
   - Select a student from the dropdown
   - Choose the date of the reading session
   - Select an assessment level (struggling, needs help, independent)
   - Add optional notes
   - Click "Save Reading Session"
4. In Quick Entry mode:
   - Swipe through students (prioritized by those who haven't read recently)
   - Select an assessment level
   - Add optional notes
   - Click "Save" to record and move to the next student

### Viewing Statistics

1. Navigate to the "Stats" tab
2. View the overview dashboard showing:
   - Total students and reading sessions
   - Average sessions per student
   - Students who haven't been read with
   - Reading status distribution
   - Assessment distribution
3. Use the "Needs Attention" tab to see which students haven't been read with recently
4. Use the "Reading Frequency" tab to see how many sessions each student has had

### Exporting Data

1. Navigate to the "Stats" tab
2. Click the "Export Data" button to download a CSV file with student reading data
3. This file can be opened in Excel or Google Sheets to share with teachers

## Data Storage

The application uses a persistent storage solution that allows data to be shared between different browsers and devices:

- Data is stored in a file on the server using Docker volumes
- Data persists between sessions and across different devices
- Data survives container restarts and updates
- Regular backups are still recommended using the export functionality

### How It Works

The application consists of two parts:
1. A React frontend for the user interface
2. An Express.js backend API for data storage

When deployed with Docker, the data is stored in a persistent volume, making it accessible from any device that can connect to the server.

## Mobile Usage

The app is designed to be mobile-friendly:
- Large touch targets for easy interaction
- Responsive layout that works well on phones and tablets
- Quick entry mode optimized for efficient data entry during limited volunteer time

## CI/CD with GitHub Actions

This project includes GitHub Actions workflows for continuous integration and deployment:

- Automated builds and tests on push to main branch
- Docker image building for easy deployment

## Contributing

Contributions are welcome! Here's how you can contribute:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin feature/my-new-feature`
5. Submit a pull request

Please make sure your code passes all tests and follows the project's coding style.

## License

This project is licensed under the MIT License - see the LICENSE file for details.