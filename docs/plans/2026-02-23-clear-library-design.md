# Clear Library Feature Design

## Problem

No way to bulk-remove all books from a school's library. When a school imports books with incomplete data, the only option is deleting them one by one. Need a "Clear Library" action to wipe and reimport.

## Design

### Backend: `DELETE /api/books/clear-library`

- Role: `requireAdmin()`
- Steps:
  1. Count org's `org_book_selections` rows
  2. `DELETE FROM org_book_selections WHERE organization_id = ?`
  3. `DELETE FROM books WHERE id NOT IN (SELECT book_id FROM org_book_selections)` (orphan cleanup)
  4. Return `{ message, booksUnlinked, orphansDeleted }`
- Single `db.batch()` call

### Frontend: DataManagement.js

- New Paper section below "Server Synchronization"
- Title: "Clear Book Library"
- Description: removes all books from the school's library
- Red outlined "Clear Library" button (`color="error"`)
- Only visible to admin+ roles
- Confirmation dialog shows book count ("This will remove X books...")
- Calls `reloadDataFromServer()` on success

### Out of scope

- Partial/selective clear
- Undo
- Reading session cleanup (sessions are historical record)
