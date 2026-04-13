-- Migration 0050: Add model preference to platform AI keys
-- Allows owner to select a default model per provider

ALTER TABLE platform_ai_keys ADD COLUMN model_preference TEXT;
