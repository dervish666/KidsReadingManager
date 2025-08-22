# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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