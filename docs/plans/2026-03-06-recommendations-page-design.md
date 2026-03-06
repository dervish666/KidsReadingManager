# Recommendations Page Visual Refresh

## Problem

The Book Recommendations page is functional but visually plain. Before selecting a student, the user sees only a bare dropdown. The two-button flow (Find in Library / AI Suggestions) requires unnecessary clicks. Book result cards are dense and don't make you want to pick up the book.

## Approach

Visual refresh of the existing component. No new APIs, no new dependencies, no new components. Same functionality, better presentation and flow.

## Design

### 1. Empty State (no student selected)

- Inline SVG illustration: an open book with sparkles rising from it, using theme colours (sage green, warm brown)
- Text beneath: "Select a student to find their next great read"
- Below the illustration: priority student quick-pick cards using `AppContext.prioritizedStudents`
  - Each card: student name, reading status colour dot, "last read X days ago"
  - Clicking a card selects them and immediately triggers library search
  - 4-6 cards, horizontal scroll on mobile, grid on desktop
  - Hidden if no priority students exist
- Student dropdown remains below the quick-picks for selecting any student

### 2. Student Profile Card (after selection)

- Replace the current two-column Paper with a compact horizontal bar
- Single line: student name (Nunito bold), class chip, reading level chip, favourite genre chips, edit preferences icon button
- Books-read list and likes/dislikes move to a collapsible section (hidden by default)
- "Show reading history" toggle to reveal details

### 3. Auto-search and Action Flow

- Selecting a student immediately triggers `handleLibrarySearch()` (no button click needed)
- Results area shows loading skeleton (placeholder card shapes with pulse animation) instead of a spinner
- Focus mode dropdown moves into the student profile bar alongside genre chips
- AI Suggestions appear as a secondary banner below library results: "Want personalised picks? Ask AI" with provider chip
- AI banner hidden if no AI provider configured
- Find in Library button removed (auto-triggered); AI Suggestions button removed (replaced by banner)

### 4. Book Result Cards

- Larger cover images: 120x180 desktop, 100x150 mobile (up from 80x120)
- More breathing room between cover and content
- Title in Nunito bold (h6), author in warm grey
- Match reason / AI reasoning highlighted: sage green left border accent with tinted background (pull quote style)
- Metadata chips (reading level, genres) smaller and lighter, `variant="outlined"` with muted colours
- "In your library" badge (AI results) overlays top-right corner of cover image
- 2-column grid desktop, 1-column mobile, more vertical padding

### 5. Scope

- All changes within `BookRecommendations.js`
- SVG illustration is inline JSX (no external assets)
- Uses existing MUI components and theme
- No new API endpoints (all data already available)
- No changes to other pages
- Only behavioural change: auto-trigger library search on student selection
