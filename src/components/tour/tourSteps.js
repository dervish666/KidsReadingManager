export const TOURS = {
  students: {
    version: 1,
    steps: [
      {
        target: '[data-tour="students-priority-list"]',
        title: 'Priority List',
        content:
          'Tap a student here to bump them to the top of your list — great for tracking who needs attention today.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="students-search"]',
        title: 'Search Students',
        content: 'Search for any student by name to find them quickly.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="students-status-filters"]',
        title: 'Filter by Status',
        content:
          'Filter students by reading status. Red means not read recently, orange needs attention, green is on track.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="students-row"]',
        title: 'Student Details',
        content:
          'Tap any student to see their reading history, edit their profile, and adjust their preferences.',
        placement: 'top',
      },
    ],
  },
  'session-form': {
    version: 1,
    steps: [
      {
        target: '[data-tour="session-student-select"]',
        title: 'Pick a Student',
        content:
          'Choose a student to record a reading session. Recently accessed students are marked for quick access.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="session-book-select"]',
        title: 'Find a Book',
        content: "Search your school's book library, or type a new title to add it.",
        placement: 'bottom',
      },
      {
        target: '[data-tour="session-location"]',
        title: 'Reading Location',
        content: 'Mark whether this was a school or home reading session.',
        placement: 'top',
      },
      {
        target: '[data-tour="session-assessment"]',
        title: 'Rate the Reading',
        content: 'Rate how the student read — this tracks their progress over time.',
        placement: 'top',
      },
      {
        target: '[data-tour="session-save"]',
        title: 'Save Session',
        content: 'Save the session. You can always come back and edit or add notes.',
        placement: 'top',
      },
    ],
  },
  'home-reading': {
    version: 2,
    steps: [
      {
        target: '[data-tour="register-date-range"]',
        title: 'Choose Dates',
        content: 'Choose a date range — This Week is great for daily check-ins.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="register-table"]',
        title: 'The Register',
        content: 'Each cell is a student and date. Tap to record their reading for that day.',
        placement: 'top',
      },
      {
        target: '[data-tour="register-totals"]',
        title: 'Daily Totals',
        content: 'See at a glance how many students read each day.',
        placement: 'top',
      },
    ],
  },
  recommendations: {
    version: 2,
    steps: [
      {
        target: '[data-tour="recs-student-select"]',
        title: 'Pick a Student',
        content:
          'Choose a student to find book recommendations matched to their reading level and interests.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="recs-profile-bar"]',
        title: 'Student Profile',
        content:
          'See their reading level, favourite genres, and focus mode at a glance. Tap the pencil to edit preferences.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="recs-focus-mode"]',
        title: 'Focus Mode',
        content:
          'Balanced finds a mix, Consolidation picks easier books to build confidence, and Challenge stretches them.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="recs-results"]',
        title: 'Library Matches',
        content:
          'Books from your school library that suit this student — matched by level, genre, and reading history.',
        placement: 'top',
      },
      {
        target: '[data-tour="recs-ai-banner"]',
        title: 'Ask AI',
        content:
          'Want personalised picks beyond your library? Ask AI is available with an API key — ask your admin to set one up in Settings.',
        placement: 'top',
      },
    ],
  },
  stats: {
    version: 1,
    steps: [
      {
        target: '[data-tour="stats-tabs"]',
        title: 'Different Views',
        content: 'Switch between Overview, Streaks, Books, and more for deeper insights.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="stats-summary-cards"]',
        title: 'Key Numbers',
        content: "Your key numbers: total students, sessions, averages, and who hasn't read yet.",
        placement: 'bottom',
      },
      {
        target: '[data-tour="stats-weekly-activity"]',
        title: 'Weekly Trend',
        content: 'See if reading is trending up or down compared to last week.',
        placement: 'top',
      },
    ],
  },
};
