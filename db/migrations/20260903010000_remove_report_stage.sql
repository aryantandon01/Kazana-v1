-- Remove the `stage` column from interview_reports.
-- Reports now describe the whole interview process, not a single stage.
--
-- `idx_reports_company` is a composite index over (company, role_key, stage), so
-- it must be dropped before the column can be dropped. Recreate it without
-- `stage` to keep company+role corroboration lookups fast.

DROP INDEX IF EXISTS idx_reports_company;

ALTER TABLE interview_reports
  DROP COLUMN IF EXISTS stage;

CREATE INDEX IF NOT EXISTS idx_reports_company ON interview_reports (company, role_key);

-- Keep the confidence_rules description in line with the new (stage-less)
-- corroboration query in POST /api/reports.
UPDATE confidence_rules
SET description = "Bonus per corroborating report (same company+role)."
WHERE slug = "corroboration_per_report";
