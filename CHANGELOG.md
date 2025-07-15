# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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