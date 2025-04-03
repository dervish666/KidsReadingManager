# Kids Reading Manager

A mobile-friendly web application for tracking reading sessions with primary school children.

## Features

- Track reading sessions for up to 30 children
- Record weekly reading sessions with date tracking
- Simple assessment system (struggling, needs help, independent)
- Visual indicators showing which children haven't been read with recently
- Statistics on reading frequency per child
- Configurable reading status durations (days for "Recently Read" and "Needs Attention" statuses)
- Session management (view, edit, delete reading sessions)
- Sorting functionality (by name, last read date, or total sessions)
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

#### Using Docker Compose (Recommended)

1. Clone this repository on your Unraid server
2. Navigate to the project directory
3. Build and start the container:

```bash
docker-compose up -d
```

4. Access the application at `http://your-unraid-ip:8080`

This method automatically sets up:
- The combined frontend/backend application
- A persistent volume for data storage (`./config` directory)

#### Building the Docker Image

If you want to build the Docker image locally:

```bash
# Build the image
docker build -t kids-reading-manager:latest .
```

You can then push this to a registry or use it directly on your Unraid server.

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

### Managing Reading Sessions

1. Click on a student card or select "View All Sessions" from the student card menu
2. View all reading sessions for the selected student
3. Edit session details (date, assessment, notes) by clicking the edit icon
4. Delete sessions by clicking the delete icon
5. Sessions are sorted by date with the newest first

### Configuring Settings

1. Navigate to the "Settings" tab
2. Adjust the number of days for "Recently Read" and "Needs Attention" statuses
3. Click "Save Settings" to apply changes
4. Click "Reset to Defaults" to restore default values

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

- Data is stored in a JSON file in the `/config` directory on the host machine
- Data persists between sessions and across different devices
- Data survives container restarts and updates
- Regular backups are still recommended using the export functionality

### How It Works

The application uses a single container architecture:
1. A Node.js/Express server that provides both:
   - API endpoints for data operations
   - Static file serving for the React frontend

When deployed with Docker, the data is stored in a host-mounted volume (`./config` directory), making it accessible from any device that can connect to the server and persisting across container restarts and updates.

## Mobile Usage

The app is designed to be mobile-friendly:
- Large touch targets for easy interaction
- Responsive layout that works well on phones and tablets
- Quick entry mode optimized for efficient data entry during limited volunteer time
- Material UI v7 components for modern, responsive design

## Technologies Used

- **Frontend**: React v19, Material UI v7, Context API with optimizations
- **Backend**: Node.js, Express.js, body-parser v2
- **Data Storage**: JSON file storage, uuid v11
- **Deployment**: Docker, Docker Compose, Node.js

## Contributing

Contributions are welcome! Here's how you can contribute:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin feature/my-new-feature`
5. Submit a pull request

Please make sure your code passes all tests and follows the project's coding style.

## License

This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0) - see the LICENSE file for details.

This means you are free to:
- Share — copy and redistribute the material in any medium or format
- Adapt — remix, transform, and build upon the material

Under the following terms:
- Attribution — You must give appropriate credit, provide a link to the license, and indicate if changes were made.
- NonCommercial — You may not use the material for commercial purposes.

For more information, visit: http://creativecommons.org/licenses/by-nc/4.0/