export const TOURS = {
  students: {
    version: 2,
    steps: [
      {
        target: '[data-tour="students-priority-list"]',
        title: 'The priority list',
        content:
          'Tap a student to pin them to the top of your list, so the ones you mean to get to today stay in front of you.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="students-search"]',
        title: 'Finding a student',
        content: 'Type a name to jump straight to that student.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="students-status-filters"]',
        title: 'Filter by status',
        content:
          'Filter students by reading status. Red means not read recently, orange needs attention, green is on track.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="students-parent-qr"]',
        title: 'Parent QR codes',
        content:
          'Print a code for every child and send it home. Parents scan it with a phone to see progress and log reading. Pick a class first, then tap here.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="students-row"]',
        title: 'Student details',
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
        title: 'Pick a student',
        content:
          "Choose who you're reading with. Anyone you've opened recently is marked, so they're quick to find.",
        placement: 'bottom',
      },
      {
        target: '[data-tour="session-book-select"]',
        title: 'Find the book',
        content: "Search your school's book library, or type a new title to add it.",
        placement: 'bottom',
      },
      {
        target: '[data-tour="session-assessment"]',
        title: 'Rate the reading',
        content: 'Rate how the student read. This is what builds the picture of their progress.',
        placement: 'top',
      },
      {
        target: '[data-tour="session-save"]',
        title: 'Save the session',
        content: 'Save the session. You can always come back and edit or add notes.',
        placement: 'top',
      },
    ],
  },
  'home-reading-quick': {
    version: 1,
    steps: [
      {
        target: '[data-tour="quick-history"]',
        title: 'The last few days',
        content:
          'These columns show the last few days so you can see at a glance who has been reading.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="quick-buttons"]',
        title: 'Record reading',
        content:
          'Tap ✓ for one read, 2/3/4 for multiple, + for a custom number. A marks absent, • means no record.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="quick-book"]',
        title: 'Current book',
        content: 'Tap to change the book a student is reading. It stays set until you change it.',
        placement: 'left',
      },
    ],
  },
  'home-reading': {
    version: 4,
    steps: [
      {
        target: '[data-tour="register-date-range"]',
        title: 'Choose dates',
        content: "Choose a date range. This Week is the one you'll use most.",
        placement: 'bottom',
      },
      {
        target: '[data-tour="register-table"]',
        title: 'The register',
        content:
          'Each cell is a student and date. Tap to record their reading for that day. Daily totals appear at the bottom of the table.',
        placement: 'bottom',
        skipScroll: true,
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
        title: 'Student profile',
        content:
          'See their reading level, favourite genres, and focus mode at a glance. Tap the pencil to edit preferences.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="recs-focus-mode"]',
        title: 'Focus mode',
        content:
          'Balanced finds a mix, Consolidation picks easier books to build confidence, and Challenge stretches them.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="recs-results"]',
        title: 'Library matches',
        content:
          "Books from your own library that suit this student, matched on level, genre and what they've read before.",
        placement: 'top',
      },
      {
        target: '[data-tour="recs-ai-banner"]',
        title: 'Ask AI',
        content:
          'Want suggestions from beyond your own shelves? Ask AI needs an API key, which your admin can add in Settings.',
        placement: 'top',
      },
    ],
  },
  stats: {
    version: 1,
    steps: [
      {
        target: '[data-tour="stats-tabs"]',
        title: 'Different views',
        content: 'Overview, Streaks, Books and the rest. Each tab answers a different question.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="stats-summary-cards"]',
        title: 'Key numbers',
        content: "Your key numbers: total students, sessions, averages, and who hasn't read yet.",
        placement: 'bottom',
      },
      {
        target: '[data-tour="stats-weekly-activity"]',
        title: 'Weekly trend',
        content: 'See if reading is trending up or down compared to last week.',
        placement: 'top',
      },
    ],
  },
};
