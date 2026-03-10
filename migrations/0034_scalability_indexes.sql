-- Composite index on org_book_selections for JOIN performance
-- Every book query JOINs on (organization_id, book_id) but only organization_id was indexed
CREATE INDEX IF NOT EXISTS idx_org_book_selections_composite ON org_book_selections(organization_id, book_id);

-- Composite index on classes for org-scoped sorted queries
CREATE INDEX IF NOT EXISTS idx_classes_org_name ON classes(organization_id, name);
