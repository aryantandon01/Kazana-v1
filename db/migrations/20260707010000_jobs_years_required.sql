-- Infer years of experience required from job descriptions at ingest time.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS years_required integer;

CREATE INDEX IF NOT EXISTS idx_jobs_years_required ON jobs (years_required);
