# Parent Portal Design

QR-code-accessed parent view for reading progress and home session logging.

## Problem

Parents have no visibility into their child's reading at school, and no way to log home reading sessions. Teachers want to encourage home reading but lack a frictionless channel to parents.

## Solution

A mobile-first parent portal accessible via QR code — no account, no password. Teachers print QR code sheets per class and send them home in book bags. Parents scan the code and see their child's reading progress, then tap to log home reading sessions.

## Access Model

### Token Design

Each student gets a unique 128-bit random token (22-char URL-safe base64). The token IS the authentication — no password, no account. This is the same model as Google Docs share links.

The URL format: `https://tallyreading.uk/parent/{token}`

Security mitigations:
- Tokens are computationally unguessable (128-bit entropy)
- Teacher-revocable at any time
- Expire at end of academic year (derived from org term dates)
- One active token per student per academic year — generating a new one revokes the old
- Invalid tokens return 404 (not 401/403) to avoid leaking token existence
- Rate-limited: 60 req/min views, 10 req/min session creation, 30 req/min book search

### Data Exposed

Only the minimum needed:
- Student first name (no surname, no school name, no class, no DOB, no reading level)
- Current book (title, author, cover)
- Reading streak (current count, active status)
- Session history (date, book title, school/home tag)
- Badge count and garden data

Even if a link is shared beyond the intended parent, the data is not individually identifiable.

## Data Model

### New Table: `parent_access_tokens`

```sql
CREATE TABLE IF NOT EXISTS parent_access_tokens (
    id TEXT PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    student_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    created_by TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX idx_parent_tokens_token ON parent_access_tokens(token);
CREATE INDEX idx_parent_tokens_student ON parent_access_tokens(student_id);
```

**Key decisions:**
- Token stored directly (not hashed) — if someone has DB read access they already have all student data
- `academic_year` column (e.g. "2025-2026") rather than `expires_at` timestamp — maps to school mental model, expiry derived from org's term dates
- No changes to `students` table — no parent email, no parent name. The QR code IS the relationship.

### Session Storage

Parent-logged sessions use the existing `reading_sessions` table:
- `location = 'home'`
- `recorded_by = NULL` (distinguishes parent-logged from teacher-logged)
- `book_id` set when selecting a school library book; NULL for external books
- `book_title_manual` / `book_author_manual` for books not in the school library

## API Endpoints

### Public (token-authenticated, added to PUBLIC_PATHS)

All in new route file: `src/routes/parent.js`

**`GET /api/parent/:token`** — Fetch parent view data.

Response:
```json
{
  "studentFirstName": "Isla",
  "currentBook": { "title": "Matilda", "author": "Roald Dahl", "coverUrl": "/api/covers/isbn/..." },
  "streak": { "current": 5, "isActive": true },
  "sessions": [
    { "date": "2026-05-20", "bookTitle": "Matilda", "location": "school" },
    { "date": "2026-05-19", "bookTitle": "Matilda", "location": "home" }
  ],
  "badges": { "total": 7, "recent": [] },
  "gardenLevel": 7
}
```

Validates: token exists, `revoked_at IS NULL`, academic year is current (determined from org's term dates; falls back to September–August cycle if no term dates configured). Returns 404 for any invalid state.

**`POST /api/parent/:token/sessions`** — Log a home reading session.

Request:
```json
{
  "sessionDate": "2026-05-21",
  "bookId": "abc123",
  "bookTitleManual": "The BFG",
  "bookAuthorManual": "Roald Dahl"
}
```

Sets `location = 'home'`, `recorded_by = NULL`. Checks GDPR `processing_restricted` flag. Rejects duplicate home sessions for same student + date (a school session on the same day is fine — the guard is per-location). Triggers streak recalculation. Returns updated streak and any new badges.

**`GET /api/parent/:token/books?q=matil`** — Search books.

School library results (org's `org_book_selections`) first, then OpenLibrary fallback. External results are NOT added to the school library.

### Teacher-facing (JWT-authenticated)

**`POST /api/parent/generate/:classId`** — Generate tokens for all students in a class who don't already have one for the current academic year. Idempotent.

**`GET /api/parent/class/:classId`** — List all tokens for a class (for print view). Returns student first names + tokens.

**`DELETE /api/parent/tokens/:tokenId`** — Revoke a specific token.

### Rate Limiting

Uses existing D1 `rate_limits` table pattern. Keyed by token value:
- View: 60 req/min
- Session create: 10 req/min
- Book search: 30 req/min

## Architecture

### Approach: Route within existing SPA

The parent portal is a new route (`/parent/:token`) in the React app. The auth gate in `App.js` bypasses authentication for this path. The route fetches its own data via the token-authenticated public API — completely separate from the JWT flow.

This maximises component reuse (BookCover, StreakBadge, GardenHeader, badge celebration) and ships fastest. The SPA bundle size (~300KB gzipped) is acceptable for parents on home WiFi.

### New Files

- `src/routes/parent.js` — API route handlers
- `src/components/parent/ParentPortal.js` — Main parent view component
- `src/components/parent/ParentSessionSheet.js` — Bottom sheet for logging sessions
- `src/components/parent/ParentBookSearch.js` — Book search with library-first results
- `src/components/parent/QRCodeSheet.js` — Printable QR code grid component
- `migrations/XXXX_parent_access_tokens.sql` — Database migration

## QR Code Generation & Print Flow

### Teacher Access Points

Three places to generate/manage QR codes:

1. **Class Manager** — "Parent QR Codes" button on each class row. Bulk generates for the whole class, opens print view.
2. **Student List** — Button in the toolbar. Generates for the current class filter.
3. **Student Detail Drawer** — "Parent QR Code" action per student. For regenerating lost codes. Shows single card with Print, Copy Link, and Regenerate (revokes old token) options.

### Print Layout

Grid of 3x4 cards per A4 page (12 students per sheet). Each card:
- QR code (SVG via `qrcode.react`)
- Student first name
- Small Tally logo
- Dotted border for cutting

Printed via browser's native `window.print()` with `@media print` stylesheet. No server-side PDF generation needed.

### Generation Flow

1. Teacher clicks "Parent QR Codes" for a class
2. `POST /api/parent/generate/:classId` creates tokens for students without one
3. `GET /api/parent/class/:classId` returns all tokens
4. QR codes rendered client-side from tokens
5. Print view displayed with print button

## Parent Portal UI

### Layout (mobile-first, top to bottom)

1. **Header** — Tally logo and "Tally Reading" text. No school name.
2. **Student greeting** — "Isla's Reading" (first name only, warm tone)
3. **Current book card** — Cover image, title, author. Tappable to change book.
4. **Streak + Read Today** — Streak badge (fire icon + count) on left, "Read Today" CTA button on right. The streak motivates; the button is the primary action.
5. **Session history** — Chronological list. Green dots + "School" tag for teacher-logged. Purple dots + "Home" tag for parent-logged.
6. **Reading garden** — At the bottom. Same visualization as the child sees at school. Badge count shown.

### "Read Today" Flow

**Step 1 — Bottom sheet** slides up:
- Date chips: Today (selected by default), Yesterday, Pick date (opens native mobile date picker)
- Book section: current book pre-filled with cover thumbnail. "Change" link to swap.
- "Log Reading" confirm button

**Step 2 — Book search** (if tapping book card or "Change"):
- Full-height bottom sheet with search input
- "School Library" section with matching results
- "Other Books" section with OpenLibrary results
- Selecting a school book sets `book_id`; selecting external stores as `book_title_manual`/`book_author_manual`

**Step 3 — Success**:
- Celebration screen with updated streak count
- If a badge was earned, shows badge celebration animation
- Auto-refreshes to main view after 2 seconds

**Duplicate guard:** If a home session already exists for this student + date, show "Already logged for today" instead of the bottom sheet. School sessions on the same day don't count — a child can read at school and at home.

## GDPR Considerations

- No parent PII stored — no email, no name, no account
- Student data exposure is minimal (first name only)
- Respects existing `processing_restricted` flag — blocks session creation
- Respects `ai_opt_out` flag — no AI features on parent portal
- Token revocation provides data access control
- Academic year expiry limits temporal exposure
- Parent portal access could be added to GDPR SAR exports (the `parent_access_tokens` table shows when links were created/revoked)

## Out of Scope

- Parent notifications (email/push) — no contact details stored
- Multi-child view (siblings) — each child has their own QR code
- Parent comments/messaging to teachers
- Reading level or assessment data on parent view
- Parent account creation or login
