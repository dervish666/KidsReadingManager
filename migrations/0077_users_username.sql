-- Manual (non-MIS) staff accounts: sign in with a firstname.lastname username
-- instead of an email address. Schools that cannot get Wonde/MyLogin approval
-- need accounts created by hand, and staff often have no school email at all.
--
-- NULL for every existing account (they sign in by email or SSO as before).
-- The unique index is partial so the NULLs do not collide.
ALTER TABLE users ADD COLUMN username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
    ON users(username) WHERE username IS NOT NULL;
