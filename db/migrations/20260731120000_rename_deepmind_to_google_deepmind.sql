-- Rename display company DeepMind → Google DeepMind
-- Keep Greenhouse board_token "deepmind" (ATS identifier) unchanged.

UPDATE companies
SET name = 'Google DeepMind'
WHERE name = 'DeepMind';

UPDATE job_sources
SET
  name = REPLACE(name, 'DeepMind', 'Google DeepMind'),
  config = jsonb_set(
    COALESCE(config, '{}'::jsonb),
    '{company_name}',
    '"Google DeepMind"'
  )
WHERE
  slug = 'gh-deepmind'
  OR name ILIKE '%DeepMind%'
  OR config->>'company_name' = 'DeepMind'
  OR config->>'board_token' = 'deepmind';

UPDATE jobs
SET company_name = 'Google DeepMind'
WHERE company_name = 'DeepMind';

-- Resume vault multi-company arrays
UPDATE resumes
SET companies = array_replace(companies, 'DeepMind', 'Google DeepMind')
WHERE 'DeepMind' = ANY (companies);

-- Facet catalog (company facet is display/filter metadata)
UPDATE facets
SET label = 'Google DeepMind'
WHERE facet_type = 'company'
  AND (facet_value IN ('deepmind', 'google_deepmind') OR label = 'DeepMind');

UPDATE facets
SET facet_value = 'google_deepmind'
WHERE facet_type = 'company'
  AND facet_value = 'deepmind'
  AND NOT EXISTS (
    SELECT 1 FROM facets f2
    WHERE f2.facet_type = 'company' AND f2.facet_value = 'google_deepmind'
  );
