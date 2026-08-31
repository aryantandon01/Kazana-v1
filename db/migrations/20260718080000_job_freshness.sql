-- Freshness-first job discovery timestamps and versioning
-- Run in Supabase SQL Editor after create_jobs_tables.sql

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS discovered_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_updated_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_version integer NOT NULL DEFAULT 1;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS content_hash text;

-- Backfill from existing rows (discovered_at ≈ first ingest; last_updated_at ≈ last row touch)
UPDATE jobs
SET
  discovered_at = COALESCE(discovered_at, created_at, now()),
  last_updated_at = COALESCE(last_updated_at, updated_at, created_at, now()),
  job_version = COALESCE(NULLIF(job_version, 0), 1)
WHERE discovered_at IS NULL OR last_updated_at IS NULL;

ALTER TABLE jobs ALTER COLUMN discovered_at SET DEFAULT now();
ALTER TABLE jobs ALTER COLUMN discovered_at SET NOT NULL;
ALTER TABLE jobs ALTER COLUMN last_updated_at SET DEFAULT now();
ALTER TABLE jobs ALTER COLUMN last_updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_discovered_at ON jobs (discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_last_updated_at ON jobs (last_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_content_hash ON jobs (source_id, content_hash);

-- Personalization: "new since last visit" (architecture support; UI can follow later)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_profiles'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_jobs_visit_at timestamptz;
  END IF;
END $$;
