-- Job Discovery tables: job_sources, jobs, ingestion_runs
-- Run in Supabase SQL Editor, then run rls_policies_jobs.sql

-- ---------------------------------------------------------------------------
-- job_sources: feed metadata and configuration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('api', 'rss')),
  license text,
  config jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  cron_interval_minutes integer NOT NULL DEFAULT 60,
  last_fetched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- jobs: normalized job postings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES job_sources(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  title text NOT NULL,
  company_name text NOT NULL,
  location text,
  description text,
  url text NOT NULL,
  job_family text,
  level text,
  years_required integer,
  posted_at timestamptz,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  job_version integer NOT NULL DEFAULT 1,
  content_hash text,
  expires_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_posted_at ON jobs (posted_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_jobs_discovered_at ON jobs (discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_last_updated_at ON jobs (last_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_company_name ON jobs (company_name);
CREATE INDEX IF NOT EXISTS idx_jobs_job_family ON jobs (job_family);
CREATE INDEX IF NOT EXISTS idx_jobs_years_required ON jobs (years_required);
CREATE INDEX IF NOT EXISTS idx_jobs_source_id ON jobs (source_id);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jobs_updated_at ON jobs;
CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_jobs_updated_at();

-- ---------------------------------------------------------------------------
-- ingestion_runs: observability per source fetch
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES job_sources(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  jobs_fetched integer NOT NULL DEFAULT 0,
  jobs_upserted integer NOT NULL DEFAULT 0,
  jobs_failed integer NOT NULL DEFAULT 0,
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_source_started ON ingestion_runs (source_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- Seed job sources (fixed UUIDs for adapter references)
-- ---------------------------------------------------------------------------
INSERT INTO job_sources (id, slug, name, source_type, license, config, is_active, cron_interval_minutes)
VALUES
  (
    'a0000000-0000-4000-8000-000000000001',
    'remotive',
    'Remotive',
    'api',
    'Remotive public API — https://remotive.com/remote-jobs/api',
    '{"api_url": "https://remotive.com/api/remote-jobs"}'::jsonb,
    true,
    60
  ),
  (
    'a0000000-0000-4000-8000-000000000002',
    'weworkremotely-programming',
    'We Work Remotely — Programming',
    'rss',
    'Public RSS feed — https://weworkremotely.com',
    '{"feed_url": "https://weworkremotely.com/categories/remote-programming-jobs.rss"}'::jsonb,
    true,
    120
  )
ON CONFLICT (slug) DO NOTHING;

-- Enable RLS (policies in rls_policies_jobs.sql)
ALTER TABLE job_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_runs ENABLE ROW LEVEL SECURITY;
