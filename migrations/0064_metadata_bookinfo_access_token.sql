-- migrations/0064_metadata_bookinfo_access_token.sql
--
-- Cloudflare Access service-token credentials for the BookInfo (rreading-glasses)
-- metadata provider. When a self-hosted instance is gated behind a Cloudflare
-- Access service-token policy, Tally must present CF-Access-Client-Id /
-- CF-Access-Client-Secret on every request or it gets a 403.
--
-- The client id is a public identifier (like a username) so it's stored plain;
-- the client secret is sensitive and stored encrypted, mirroring the API-key
-- columns (hardcover_api_key_encrypted / google_books_api_key_encrypted).
--
-- Both additive + nullable: when unset the provider sends no Access headers, so
-- the public api.bookinfo.pro default and ungated self-hosted instances are
-- unaffected. Safe in the gap between applying this migration and deploying the
-- code that reads the columns.

ALTER TABLE metadata_config ADD COLUMN bookinfo_access_client_id TEXT;
ALTER TABLE metadata_config ADD COLUMN bookinfo_access_client_secret_encrypted TEXT;
