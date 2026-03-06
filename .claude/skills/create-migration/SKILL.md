---
name: create-migration
description: Create a new D1 database migration with correct naming and conventions
disable-model-invocation: true
---

# Create Migration

Create a new D1 database migration file for TallyReading.

## Steps

1. Find the latest migration number:
   ```bash
   ls migrations/*.sql | sort -V | tail -1
   ```

2. Increment the number (format: `NNNN`), and ask the user for a short description if not provided.

3. Create the migration file at `migrations/NNNN_description.sql` with this template:
   ```sql
   -- Migration: NNNN - Description
   -- Date: YYYY-MM-DD

   -- Use IF NOT EXISTS / IF EXISTS for safety (no down migrations)
   ```

4. Key conventions to follow:
   - Use `snake_case` for all column and table names
   - Always add `organization_id` column with FK for tenant-scoped tables
   - For soft-delete tables (`organizations`, `users`), add `is_active INTEGER DEFAULT 1`
   - Add indexes for frequently queried columns
   - Use `IF NOT EXISTS` for CREATE TABLE and `IF NOT EXISTS` for new columns via pragma check

5. After creating the file, remind the user to:
   - Test locally: `npx wrangler d1 migrations apply reading-manager-db --local`
   - Deploy: `npx wrangler d1 migrations apply reading-manager-db --remote`
   - Update the CLAUDE.md comment about migration numbering if the sequence is referenced
