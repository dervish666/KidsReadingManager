# Kids Reading Manager - Application Overview

## Purpose
This application helps track reading sessions for students, providing insights into reading frequency and identifying students who may need more attention.

## Architecture (as of 2025-04-03)
- **Frontend**: React single-page application (built with Create React App).
- **Backend/API**: Integrated Node.js/Express server within the main Docker container.
- **Data Persistence**: Student and settings data are stored in a single JSON file (`app_data.json`) located in the `/config` directory within the container. This directory is intended to be mounted from the host machine's `./config` directory using Docker Compose for persistence.
- **Deployment**: Single Docker container managed by `docker-compose.yml`. The container runs the Node.js server, which serves both the static React frontend files and the backend API endpoints.

## Key Features
- Student management (add, edit, delete, bulk import).
- Reading session tracking (add, edit, delete sessions with dates, assessments, notes).
- Data visualization (reading status, prioritization).
- Data import/export (JSON, CSV).
- Configurable settings (reading status thresholds).

## Data Storage
- **File**: `/config/app_data.json` (within the container, mapped to host's `./config/app_data.json`)
- **Format**: JSON, containing `students` array and `settings` object.

## Running the Application
1.  Ensure Docker and Docker Compose are installed.
2.  Create a `./config` directory in the project root on the host machine if it doesn't exist.
3.  Run `docker-compose up -d` from the project root.
4.  Access the application in a web browser, typically at `http://localhost:8080` (or as configured in `docker-compose.yml`).