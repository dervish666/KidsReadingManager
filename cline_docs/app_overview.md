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
- Class management (add, edit, delete classes; assign students).

## Data Storage
- **File**: `/config/app_data.json` (within the container, mapped to host's `./config/app_data.json`)
- **Format**: JSON, containing `settings` object, `students` array, and `classes` array.

### Data Structures (`app_data.json`)

The `app_data.json` file holds the application's state:

```json
{
  "settings": {
    // Application settings (e.g., reading status thresholds)
  },
  "students": [
    {
      "id": "student_UUID", // Unique identifier for the student
      "name": "Student Name",
      // ... other student-specific fields (e.g., reading history) ...
      "classId": "class_UUID | null", // Reference to the 'id' in the 'classes' array, or null if unassigned
      "createdAt": "ISO8601 Timestamp",
      "updatedAt": "ISO8601 Timestamp"
    }
    // ... more student objects
  ],
  "classes": [
    {
      "id": "class_UUID", // Unique identifier for the class
      "name": "Class Name", // e.g., "Year 3 Robins"
      "teacherName": "Teacher's Name",
      "createdAt": "ISO8601 Timestamp",
      "updatedAt": "ISO8601 Timestamp"
    }
    // ... more class objects
  ]
}
```

## Class Management UI Overview

A new feature allows for grouping students into classes managed by teachers.

-   **Class Creation/Management**: A dedicated "Classes" page (accessible via main navigation or settings) will allow users to:
    -   View a list of existing classes (Name, Teacher).
    -   Add new classes (providing Name and Teacher Name).
    -   Edit existing class details.
    -   Delete classes (handling assigned students, e.g., by unassigning them).
-   **Student Assignment**:
    -   The "Add Student" and "Edit Student" forms will include a dropdown selector to assign or change a student's class. This dropdown lists existing classes or an "Unassigned" option.
-   **Viewing Students by Class**:
    -   The main "Student List" will be enhanced with options to filter or group students based on their assigned class.
    -   Alternatively, clicking a class on the "Classes" page may display a filtered list of students belonging only to that class.
-   **`students`**: Array of student objects. Each student now includes a `classId` field to link them to a class.
-   **`classes`**: A new array containing class objects, each with a unique `id`, `name`, and `teacherName`.
## Running the Application
1.  Ensure Docker and Docker Compose are installed.
2.  Create a `./config` directory in the project root on the host machine if it doesn't exist.
3.  Run `docker-compose up -d` from the project root.
4.  Access the application in a web browser, typically at `http://localhost:8080` (or as configured in `docker-compose.yml`).