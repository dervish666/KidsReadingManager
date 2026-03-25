-- Add demographic fields synced from Wonde
ALTER TABLE students ADD COLUMN date_of_birth TEXT;
ALTER TABLE students ADD COLUMN gender TEXT;
ALTER TABLE students ADD COLUMN first_language TEXT;
ALTER TABLE students ADD COLUMN eal_detailed_status TEXT;
