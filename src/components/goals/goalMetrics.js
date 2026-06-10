// Shared display config for the six class-goal metrics, used by the
// Achievements garden card and the whiteboard display (ClassGoalsDisplay).
// Colours stay inside the Cozy Bookshelf palette — sage, warm browns, the
// plum/teal accents already AA-tuned in the theme. No corporate blue/purple.

export const METRIC_ORDER = ['readers', 'reading_days', 'sessions', 'badges', 'genres', 'books'];

export const METRIC_CONFIG = {
  readers: {
    label: 'Active Readers',
    description: "Students who've read at least once",
    icon: '👥',
    color: '#9E6B8A', // muted plum (theme accent.home)
    colorEnd: '#7E5570',
  },
  reading_days: {
    label: 'Reading Days',
    description: 'Different days the class has read',
    icon: '📅',
    color: '#D4A06A', // warm amber (theme warning family)
    colorEnd: '#B8864A',
  },
  sessions: {
    label: 'Reading Sessions',
    description: 'Total sessions across all students',
    icon: '📖',
    color: '#8AAD8A', // sage (theme primary family)
    colorEnd: '#6B8E6B',
  },
  badges: {
    label: 'Badges Earned',
    description: 'Total badges collected by the class',
    icon: '🏆',
    color: '#D4956A', // warm coral
    colorEnd: '#C47A4A',
  },
  genres: {
    label: 'Genres Explored',
    description: 'Different genres read across',
    icon: '🎨',
    color: '#C4956A', // warm tan
    colorEnd: '#A67B50',
  },
  books: {
    label: 'Unique Books',
    description: 'Different books the class has read',
    icon: '📚',
    color: '#5A8A9E', // muted teal (theme accent.school)
    colorEnd: '#46768A',
  },
};
