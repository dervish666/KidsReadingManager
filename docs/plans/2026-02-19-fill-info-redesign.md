# Fill Info Button Redesign

**Date**: 2026-02-19
**Status**: Approved

## Problem

The current "Fill Info" button on the Books page opens a dropdown menu with three separate options (Fill Missing Authors, Fill Missing Descriptions, Fix Missing Genres). This is overly granular — users shouldn't need to think about which metadata type to fill. Additionally, there's no way to refresh/update books that already have data.

## Design

Replace the single "Fill Info" dropdown with two distinct buttons:

### 1. "Fill Missing" Button

**Purpose**: Automatically find and fill all missing data for books with gaps.

**Behaviour**:
- Identifies all books missing any of: author, description, or genres
- Authors set to "Unknown" are treated as missing
- For each book, makes one lookup pass to the configured provider (getBookDetails + findGenresForBook)
- Only fills fields that are currently empty/missing — never overwrites existing data
- Shows a progress bar during processing
- Auto-applies all found data (no review dialog needed)
- Shows snackbar summary: "Updated 42 books (23 authors, 38 descriptions, 31 genres)"

**Icon**: AutoFixHighIcon (wand) — same as current

### 2. "Refresh All" Button

**Purpose**: Re-fetch metadata for ALL books from the provider and let the user review proposed changes before applying.

**Behaviour**:
- Processes ALL books (not just those with missing data)
- For each book, fetches fresh metadata from the configured provider
- Compares fetched data against existing data
- Shows a diff-style review dialog:
  - Each book with proposed changes gets a card/row
  - Per field: old value -> new value with checkbox to include/exclude
  - Books with no changes hidden (or collapsed "no changes" section)
  - All changes checked by default
- User clicks "Apply Selected Changes" to save
- Snackbar summary of applied changes

**Icon**: SyncIcon or RefreshIcon

### Data Source

Both buttons use whatever metadata provider the user has configured in Settings (OpenLibrary or Google Books). No hardcoded provider preference.

## What Gets Removed

- `aiFillMenuAnchor` state and dropdown menu
- Three separate lookup state groups (author/description/genre progress, results, show flags — ~18 state variables)
- Three separate results dialogs (Author/Description/Genre Lookup Results — ~300 lines of JSX)
- `includeUnknownAuthors` toggle and state
- `getBooksWithoutAuthors`, `getBooksWithoutDescriptions`, `getBooksWithoutGenres` helper functions
- `handleFillMissingAuthors`, `handleFillMissingDescriptions`, `handleFillMissingGenres` functions
- `handleApplyAuthorUpdates`, `handleApplyDescriptionUpdates`, `handleApplyGenreUpdates` functions
- `handleCancelAuthorResults`, `handleCancelDescriptionResults`, `handleCancelGenreResults` functions

## What Gets Added

- `handleFillMissing` — unified function that fills all gaps in one pass per book
- `handleRefreshAll` — unified function that fetches fresh data for all books
- Fill missing progress state (single progress bar)
- Refresh all progress + review state
- One unified diff-style review dialog for Refresh All
- `getBooksWithMissingData` helper — returns books missing any of author/description/genres

## Net Effect

Estimated ~400-500 lines removed, ~200-300 lines added. Simpler UX, less state, fewer dialogs.
