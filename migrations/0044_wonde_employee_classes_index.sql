-- Add composite index on wonde_employee_classes for org + employee lookups
CREATE INDEX IF NOT EXISTS idx_wonde_employee_classes_org_employee
ON wonde_employee_classes(organization_id, wonde_employee_id);
