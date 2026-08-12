-- Drop three redundant indexes on org_book_selections.
--
-- Every write to this table maintains every index on it, and org_book_selections
-- is the most-written table in the system (2,411 of the demo snapshot's 2,791
-- rows). It carried 8 indexes; three of them can never be chosen over one that
-- remains. Verified against the PRODUCTION schema, not the local copy:
--
--   idx_org_books_org_available        (organization_id, is_available)
--     Byte-identical to idx_book_selections_org_available, added later by
--     migrations/0020_composite_indexes.sql without noticing 0005 already had
--     it. Same columns, same order.
--
--   idx_org_book_selections_composite  (organization_id, book_id)
--     Duplicates the automatic index behind UNIQUE(organization_id, book_id)
--     in migrations/0005_org_book_selections.sql. SQLite serves those lookups
--     from the autoindex, which cannot be dropped and is always present.
--
--   idx_book_selections_org            (organization_id)
--     A strict leading prefix of idx_book_selections_org_available. SQLite uses
--     a composite index for queries constraining only its leading column, so
--     this adds write cost and no read path.
--
-- Deliberately NOT dropped here: idx_book_selections_available and the ~11
-- other indexes flagged as unused elsewhere in the schema. Those are judgement
-- calls that need EXPLAIN QUERY PLAN before/after against a production-shaped
-- copy — unlike the three above, none of them is provably shadowed by another
-- index, and a wrong guess turns a seek into a scan on a growing table.

DROP INDEX IF EXISTS idx_org_books_org_available;
DROP INDEX IF EXISTS idx_org_book_selections_composite;
DROP INDEX IF EXISTS idx_book_selections_org;
