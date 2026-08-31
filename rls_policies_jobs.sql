-- RLS policies for Job Discovery tables
-- Run AFTER create_jobs_tables.sql

-- Public read on job_sources (feed metadata)
CREATE POLICY "Allow public read on job_sources"
  ON job_sources
  FOR SELECT
  USING (true);

-- Public read on jobs (Job Discovery listing)
CREATE POLICY "Allow public read on jobs"
  ON jobs
  FOR SELECT
  USING (true);

-- ingestion_runs: no client policies — service role only for writes/reads
-- (RLS enabled with zero policies blocks anon/authenticated access)
