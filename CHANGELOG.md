# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.4.2 - 2025-08-22

### Added
- **Recently Accessed Students Feature**: Added recently accessed students to the top of the student dropdown in the standard reading form
  - Added state management for recently accessed students in AppContext ([`src/contexts/AppContext.js`](src/contexts/AppContext.js:29))
  - Modified PrioritizedStudentsList to track clicked students in recent list ([`src/components/students/PrioritizedStudentsList.js`](src/components/students/PrioritizedStudentsList.js:153))
  - Updated SessionForm dropdown to show recently accessed students at the top with star icons and "Recent" labels ([`src/components/sessions/SessionForm.js`](src/components/sessions/SessionForm.js:140))
  - Students clicked in priority list now appear at the top of the standard form dropdown for quick access

### Changed
- Enhanced user workflow by providing quick access to recently handled students
- Improved dropdown organization with visual distinction for recently accessed students

### Version
- Bumped package version to 1.4.2

## 1.4.1 - 2025-08-22

### Fixed
- **Class Persistence**: Fixed issue where disabled status reverted to active on page reload
  - Added missing `classes` array to data file structure ([`config/app_data.json`](config/app_data.json:1))
  - Enhanced server robustness by ensuring all required data structures are initialized ([`server/index.js`](server/index.js:65))
  - Classes and their disabled status now persist correctly across page reloads

### Version
- Bumped package version to 1.4.1

## 1.3.0 - 2025-08-22

### Added
- **Class Disable/Enable Feature**: Added ability to disable classes for end-of-year scenarios
  - Added `disabled` field to class data structure with default value of `false`
  - Added server-side API endpoints for class management ([`server/index.js`](server/index.js:208))
  - Enhanced ClassManager with toggle switches and status indicators ([`src/components/classes/ClassManager.js`](src/components/classes/ClassManager.js:1))
  - Updated AppContext to include disabled field in class creation ([`src/contexts/AppContext.js`](src/contexts/AppContext.js:342))
  - Updated prioritized students calculation to exclude students from disabled classes ([`src/contexts/AppContext.js`](src/contexts/AppContext.js:700))

### Changed
- **Student Filtering**: Modified all components to exclude students from disabled classes:
  - Student List with class filtering ([`src/components/students/StudentList.js`](src/components/students/StudentList.js:110))
  - Session Form student dropdown ([`src/components/sessions/SessionForm.js`](src/components/sessions/SessionForm.js:83))
  - Student Sessions class selector ([`src/components/sessions/StudentSessions.js`](src/components/sessions/StudentSessions.js:221))
  - All stats components ([`src/components/stats/ReadingFrequencyChart.js`](src/components/stats/ReadingFrequencyChart.js:13), [`src/components/stats/DaysSinceReadingChart.js`](src/components/stats/DaysSinceReadingChart.js:13), [`src/components/stats/ReadingTimelineChart.js`](src/components/stats/ReadingTimelineChart.js:16))

### Fixed
- Layout overflows on narrow viewports and small-chart column sampling

### Version
- Bumped package version to 1.3.0

## [1.1.0] - 2025-07-15

### Added
- **Delete Student Functionality**: Added ability to delete students directly from the Student Sessions modal
  - Added delete button to Student Sessions modal header for quick access
  - Implemented confirmation dialog to prevent accidental deletions
  - Modal automatically closes after successful deletion
  - Uses existing AppContext.deleteStudent function for consistency
  - Follows established patterns for destructive actions with proper user confirmation

### Changed
- Enhanced Student Sessions modal with additional management capabilities
- Improved user experience by providing direct access to student deletion from the sessions view

## [1.0.2] - Previous Release
- Initial Cloudflare Workers implementation
- Basic student management (add, edit)
- Reading session tracking
- Class management functionality
- Data import/export capabilities

## [1.0.0] - Initial Release
- Basic application structure
- Student and reading session management
- Core functionality implementation