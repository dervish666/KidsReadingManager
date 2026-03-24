-- Add contact and address fields to organizations for billing and display.
-- Populated from Wonde during schoolApproved webhook, editable by owner.
ALTER TABLE organizations ADD COLUMN contact_email TEXT;
ALTER TABLE organizations ADD COLUMN phone TEXT;
ALTER TABLE organizations ADD COLUMN address_line_1 TEXT;
ALTER TABLE organizations ADD COLUMN address_line_2 TEXT;
ALTER TABLE organizations ADD COLUMN town TEXT;
ALTER TABLE organizations ADD COLUMN postcode TEXT;
