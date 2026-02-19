# Product Context: Tally Reading

## Why this project exists
Tally Reading is a multi-tenant SaaS web application designed to help schools, teachers, teaching assistants, and parents track reading progress for primary school children. It provides a comprehensive platform for recording and monitoring reading sessions, managing students across multiple schools, and delivering AI-powered book recommendations.

## What problems it solves

### For Schools & Organizations
- **Multi-School Management**: Owners can manage multiple schools from a single platform
- **User Management**: Create and manage teacher accounts with appropriate permissions
- **Data Isolation**: Each school's data is completely isolated and secure
- **Scalability**: Supports large book collections (18,000+) and multiple classes

### For Teachers & Teaching Assistants
- **Reading Tracking**: Track which children have been read with recently and which need attention
- **Assessment Recording**: Record assessment levels for each reading session
- **Visual Indicators**: Quickly identify children who need reading support
- **Class Management**: Organize students into classes with easy filtering
- **Home Reading Register**: Efficient class-wide home reading entry

### For Parents
- **Home Reading Logging**: Record reading sessions done at home
- **Progress Visibility**: See child's reading history and achievements
- **Book Discovery**: Get personalized book recommendations

### For All Users
- **AI Recommendations**: Intelligent book suggestions based on reading history and preferences
- **Data Persistence**: Secure cloud storage with import/export capabilities
- **Mobile-Friendly**: Works on tablets, phones, and desktops

## How it should work

### 1. Organization Setup (Owner)
- Register a new organization (school)
- Configure subscription tier and limits
- Create admin and teacher accounts
- Set up AI provider for recommendations

### 2. Class & Student Management (Admin/Teacher)
- Create classes (Year 1-11)
- Add students individually or via bulk import
- Configure student reading preferences
- Assign students to classes

### 3. Reading Session Recording (Teacher)
- **Standard Mode**: Detailed entries with book, assessment, and notes
- **Quick Entry Mode**: Rapid logging for busy classrooms
- **Home Reading Register**: Class-wide grid for home reading records
- Record date, assessment level, location (school/home), and notes

### 4. Book Management (Admin/Teacher)
- Maintain comprehensive book database
- Import books via JSON/CSV
- Auto-fill metadata from OpenLibrary/Google Books
- Categorize by genre and reading level

### 5. AI-Powered Recommendations
- Select a student to get personalized suggestions
- AI considers reading history, preferences, and level
- Recommendations include reasoning and age-appropriateness

### 6. Statistics and Reporting
- View overview dashboard with key metrics
- Identify students who need attention
- Track reading frequency per student
- Export data for sharing with parents/administrators

### 7. User Management (Owner/Admin)
- Create new user accounts
- Assign appropriate roles
- Edit user details and school assignments
- Deactivate users as needed

## User Roles

### Owner
- Full system access
- Manage all organizations
- Create/edit/deactivate schools
- Move users between organizations
- Access all features

### Admin
- Organization-level management
- Create/manage users within organization
- Full access to students, classes, books
- Configure organization settings

### Teacher
- Manage students and classes
- Record reading sessions
- View statistics and recommendations
- Cannot manage users or settings

### Readonly
- View-only access to data
- Cannot create or modify records
- Useful for observers or reporting

## Data Storage

### Multi-Tenant Mode (Default)
- **Cloudflare D1 Database**: SQL storage for all data
- **Organization Isolation**: Data automatically scoped by organization
- **Audit Logging**: Track all changes for compliance

### Legacy Mode
- **Cloudflare KV**: Key-value storage for single-tenant deployments
- **Backward Compatible**: Existing deployments continue to work

## Key Workflows

### Daily Reading Session Entry
1. Teacher opens Reading or Record page
2. Selects class from global filter
3. Records sessions for each student
4. System updates statistics automatically

### Weekly Progress Review
1. Teacher opens Statistics page
2. Reviews students needing attention
3. Checks reading frequency charts
4. Plans targeted reading sessions

### Getting Book Recommendations
1. Navigate to Recommendations
2. Select student
3. Review AI-generated suggestions
4. Record recommended book in next session

### Onboarding New Students
1. Navigate to Students page
2. Use bulk import for multiple students
3. Set reading levels and preferences
4. Assign to appropriate class
