-- migrations/0063_metadata_bookinfo_base_url.sql
--
-- Configurable base URL for the BookInfo (rreading-glasses) metadata provider.
-- When NULL the adapter falls back to the public instance (https://api.bookinfo.pro);
-- owners point this at a self-hosted instance for unthrottled bulk enrichment.
--
-- Additive + nullable, so it is safe against the currently-live code in the gap
-- between applying this migration and deploying the code that reads the column.

ALTER TABLE metadata_config ADD COLUMN bookinfo_base_url TEXT;
