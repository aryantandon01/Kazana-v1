-- Canonical extraction metadata + experience range columns

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS extraction jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS years_required_min integer;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS years_required_max integer;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS extraction_version text;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS extracted_at timestamptz;

-- Backfill min from legacy years_required
UPDATE jobs
SET years_required_min = years_required
WHERE years_required IS NOT NULL
  AND years_required_min IS NULL;

COMMENT ON COLUMN jobs.extraction IS
  'Per-field ExtractionResult map (value, confidence, source, status, evidence, extractor)';
COMMENT ON COLUMN jobs.years_required_min IS
  'Minimum years of experience required (canonical); years_required stays synced for filters';
COMMENT ON COLUMN jobs.years_required_max IS
  'Maximum years of experience when JD specifies a range';
