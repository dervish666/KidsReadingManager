# System Patterns: Kids Reading Manager

## Architecture Patterns

### Frontend Architecture
- **Component-Based Structure**: UI is organized into reusable components
- **Context API for State Management**: AppContext provides global state and functions
- **Responsive Design**: Mobile-first approach with Material-UI

### Backend Architecture
- **RESTful API**: Express.js server providing endpoints for data operations
- **JSON Data Format**: All data is stored and transferred as JSON
- **Stateless API**: Server doesn't maintain session state

## Key Technical Decisions

### State Management
- **AppContext Provider**: Central state management for the entire application
- **Optimistic Updates**: UI updates immediately while API calls happen in background
- **Error Handling**: API errors are captured but UI still updates for better UX

### Data Flow
1. **Data Loading**: Fetched from API on initial render
2. **CRUD Operations**: 
   - Create: Add students and reading sessions
   - Read: Display students and their reading data
   - Update: Edit student information
   - Delete: Remove students from the system
3. **Data Persistence**: API endpoints handle saving to database

### UI Patterns
- **Card-Based Interface**: Students displayed as cards with status indicators
- **Modal Dialogs**: Used for forms and confirmations
- **Visual Status Indicators**: Color-coded to show reading status
- **Quick Actions**: Efficient workflows for common tasks

## Code Organization

### Directory Structure
- **/src/components/**: UI components organized by feature
- **/src/contexts/**: Context providers for state management
- **/src/styles/**: Theme and styling configurations
- **/server/**: Backend API implementation
- **/public/**: Static assets

### Component Patterns
- **Container/Presentation Pattern**: 
  - Container components connect to context and handle logic
  - Presentation components focus on rendering UI
- **Composition**: Complex UIs built from smaller, focused components