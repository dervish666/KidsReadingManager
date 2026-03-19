-- Add page_url column to track which page the user was on when submitting a support ticket
ALTER TABLE support_tickets ADD COLUMN page_url TEXT;
