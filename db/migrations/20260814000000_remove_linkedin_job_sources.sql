-- Remove LinkedIn job sources and their ingested jobs
-- Run in Supabase SQL Editor (after the code change: LinkedIn boards removed from seed data)

-- 1) Deactivate LinkedIn job sources so ingest skips them (kept for audit)
UPDATE job_sources
SET is_active = false
WHERE slug IN ('gh-linkedin', 'lever-linkedin')
   OR name ILIKE '%linkedin%';

-- 2) Delete jobs ingested from those sources.
--    matches.job_id has ON DELETE CASCADE, so stored match rows are cleaned automatically.
DELETE FROM jobs
WHERE source_id IN (
  SELECT id FROM job_sources
  WHERE slug IN ('gh-linkedin', 'lever-linkedin')
     OR name ILIKE '%linkedin%'
);

-- 3) Verify (should return 0 rows)
SELECT count(*) AS remaining_linkedin_jobs
FROM jobs
WHERE source_id IN (
  SELECT id FROM job_sources
  WHERE slug IN ('gh-linkedin', 'lever-linkedin')
     OR name ILIKE '%linkedin%'
);