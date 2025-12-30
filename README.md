# 📚 Kids Reading Manager

A comprehensive web application designed to help teachers, teaching assistants, and parents track reading progress for primary school children. Built with React and featuring AI-powered book recommendations, this tool makes it easy to monitor reading sessions, identify students who need attention, and encourage continued reading engagement.

### Student Management Dashboard
The main Students page features a clean, intuitive interface with:
- **Priority Reading List**: Visual cards showing students who need reading attention most
- **Color-coded Status Indicators**: Pink cards for students who need reading, with days since last session
- **Student Metrics**: Total reading sessions and time since last read for each student
- **Filtering Options**: Filter by class and sort by reading priority
- **Bulk Import**: Easy CSV import functionality for adding multiple students

### Reading Session Tracking
The Reading section provides two modes for session entry:
- **Standard Mode**: Comprehensive form with all session details
- **Quick Entry Mode**: Streamlined interface for rapid session logging
- **Smart Features**: Student selection, date picker, book autocomplete
- **Environment Tracking**: Toggle between School and Home reading locations
- **Assessment Recording**: Capture reading level assessments and notes

### Analytics Dashboard
The Statistics section offers comprehensive insights:
- **Overview Metrics**: Total students (10), reading sessions (75), average sessions per student (7.5)
- **Reading Status Distribution**: Visual breakdown showing 90% need reading, 10% up to date
- **Multiple Chart Types**: Reading frequency, timeline, and needs attention views
- **Export Functionality**: Data export capabilities for reporting
- **Assessment Analytics**: Distribution of reading assessment levels

### AI-Powered Recommendations
The Recommendations section enables:
- **Student Selection**: Choose specific students for personalized recommendations
- **Class Filtering**: Filter recommendations by class groups
- **AI Integration**: Powered by advanced language models for intelligent suggestions
- **Preference-Based**: Recommendations based on student reading history and preferences

## 🌟 Key Features

### 👥 Student Management
- **Student Profiles**: Create detailed profiles with reading levels and preferences
- **Class Organization**: Group students into classes with teacher assignments
- **Bulk Import**: Quickly add multiple students via CSV import
- **Visual Status Indicators**: Instantly see which students need reading attention

### 📖 Reading Session Tracking
- **Comprehensive Logging**: Record reading sessions with books, assessments, and notes
- **Environment Tracking**: Separate tracking for school and home reading
- **Quick Entry Mode**: Rapid session logging for busy classroom environments
- **Assessment Levels**: Track reading progress with customizable assessment scales

### 🎯 Personalized Reading Preferences
- **Genre Preferences**: Capture favorite genres and topics for each student
- **Interest Tracking**: Record what students like and dislike in their reading
- **Reading Formats**: Track preferences for picture books, chapter books, etc.
- **Customizable Profiles**: Tailor each student's reading profile to their unique interests

### 🤖 AI-Powered Book Recommendations
- **Intelligent Suggestions**: Get personalized book recommendations powered by AI
- **Context-Aware**: Recommendations based on reading history, preferences, and level
- **Age-Appropriate**: Ensures suggestions match the student's developmental stage
- **Educational Balance**: Balances student interests with educational value

### 📊 Analytics & Insights
- **Reading Frequency Charts**: Visual tracking of how often students read
- **Progress Timeline**: See reading progress over time for each student
- **Days Since Reading**: Identify students who haven't read recently
- **Class Statistics**: Overview of reading patterns across entire classes

### 📚 Book & Genre Management
- **Book Database**: Maintain a comprehensive library of available books
- **Smart Autocomplete**: Quick book entry with existing database integration
- **Genre Classification**: Organize books by genres for better recommendations
- **Reading Level Tracking**: Match books to appropriate reading levels

## 🚀 Quick Start


### Local Development
```bash
# Clone the repository
git clone https://github.com/dervish666/KidsReadingManager.git
cd KidsReadingManager

# Install dependencies
npm install

# Start the development server
npm run start:dev

# Open http://localhost:3000 in your browser
```

## 💡 How It Works

### For Teachers & Teaching Assistants
1. **Set Up Classes**: Create classes and add students with their reading levels
2. **Configure Preferences**: Set up each student's reading preferences and interests
3. **Track Sessions**: Log reading sessions during guided reading time
4. **Monitor Progress**: Use visual indicators to identify students needing attention
5. **Get Recommendations**: Use AI to find perfect books for each student

### For Parents
1. **View Progress**: See your child's reading history and achievements
2. **Home Reading**: Log reading sessions done at home
3. **Discover Books**: Get personalized book recommendations for your child
4. **Track Engagement**: Monitor reading frequency and preferences

## 🎨 User Interface

The application features a clean, mobile-friendly interface with:

- **Bottom Navigation**: Easy access to Students, Sessions, Stats, and Recommendations
- **Student Cards**: Visual overview of each student's reading status
- **Interactive Charts**: Engaging visualizations of reading progress
- **Quick Actions**: Streamlined workflows for common tasks
- **Responsive Design**: Works seamlessly on tablets, phones, and desktops

## 🔧 Technical Highlights

- **Modern React**: Built with React 19 and Material-UI v7 components
- **Serverless Architecture**: Runs on Cloudflare Workers for global performance
- **Multi-Tenant SaaS**: Support for multiple schools with complete data isolation
- **Role-Based Access**: Owner, Admin, Teacher, and Readonly permission levels
- **AI Integration**: Multi-provider support (Anthropic Claude, OpenAI, Google Gemini)
- **D1 Database**: Cloudflare D1 SQL database for scalable data storage
- **Data Persistence**: Secure cloud storage with import/export capabilities
- **Mobile-First**: Optimized for touch interfaces and mobile devices

## 📈 Use Cases

### Primary Schools
- Track guided reading sessions across multiple classes
- Identify students falling behind in reading frequency
- Generate reports for parent-teacher conferences
- Coordinate reading activities between teachers

### Home Education
- Monitor children's reading progress at home
- Discover new books aligned with interests
- Track reading habits and preferences
- Maintain detailed reading records

### Reading Volunteers
- Efficiently log sessions with multiple students
- Quick identification of students needing extra support
- Simple interface for non-technical users
- Consistent tracking across volunteer sessions

## 🛡️ Privacy & Security

- **Multi-Tenant Isolation**: Each school's data is completely isolated
- **JWT Authentication**: Secure token-based authentication with automatic refresh
- **Role-Based Access**: Granular permissions control who can access what
- **No Tracking**: No analytics or user tracking beyond application functionality
- **Secure Storage**: Data encrypted in transit and at rest
- **Export Freedom**: Full data export capabilities for portability

## 📋 Requirements

- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection for AI recommendations
- Optional: API key for book recommendations

## 🤝 Contributing

We welcome contributions! Whether you're fixing bugs, adding features, or improving documentation, your help makes this tool better for educators and families everywhere.

## 📄 License

This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 (CC BY-NC 4.0) license. Free for educational and personal use.

---

## 📚 Documentation

- **[Installation Guide](INSTRUCTIONS.md)** - Detailed setup and deployment instructions
- **[App Overview](cline_docs/app_overview.md)** - Technical architecture and features
- **[Product Context](cline_docs/productContext.md)** - Project goals and use cases

## 🆘 Support

Having trouble? Check our documentation or open an issue on GitHub. We're here to help make reading tracking as simple as possible!

---

*Built with ❤️ for educators, parents, and young readers everywhere.*
