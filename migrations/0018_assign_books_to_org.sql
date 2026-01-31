-- Migration 0018: Assign all existing books to organization
-- =========================================================
-- This links all current books to the specified organization via org_book_selections
-- so they'll be visible when organization-scoped book queries are implemented.

INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
SELECT
  lower(hex(randomblob(16))),
  'b1191a0e-d1b5-4f6b-bf7e-9454d53da417',
  id,
  1,
  datetime('now')
FROM books
WHERE NOT EXISTS (
  SELECT 1 FROM org_book_selections
  WHERE book_id = books.id
  AND organization_id = 'b1191a0e-d1b5-4f6b-bf7e-9454d53da417'
);
