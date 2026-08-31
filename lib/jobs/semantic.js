/**
 * Helpers for Facets (structured) + Tags (semantic) queries.
 */

const JOB_SEMANTIC_SELECT = `
  *,
  job_sources(name, slug, license),
  job_facets(source, confidence, facets(facet_type, facet_value, label)),
  job_tags(tag_source, confidence_score, tags(tag_name, tag_slug, tag_category))
`;

/**
 * Shape nested Supabase rows into a flat semantic payload for clients.
 * @param {object} job
 */
export function shapeJobSemantics(job) {
  if (!job) return job;

  const facets = (job.job_facets || [])
    .map((row) => row.facets)
    .filter(Boolean);

  const careerAreas = facets
    .filter((f) => f.facet_type === 'career_area')
    .map((f) => ({ value: f.facet_value, label: f.label }));

  const experienceLevels = facets
    .filter((f) => f.facet_type === 'experience_level')
    .map((f) => ({ value: f.facet_value, label: f.label }));

  const employmentTypes = facets
    .filter((f) => f.facet_type === 'employment_type')
    .map((f) => ({ value: f.facet_value, label: f.label }));

  const workArrangements = facets
    .filter((f) => f.facet_type === 'work_arrangement')
    .map((f) => ({ value: f.facet_value, label: f.label }));

  const tags = (job.job_tags || [])
    .map((row) => ({
      name: row.tags?.tag_name,
      slug: row.tags?.tag_slug,
      category: row.tags?.tag_category,
      source: row.tag_source,
      confidence: row.confidence_score,
    }))
    .filter((t) => t.name);

  const { job_facets: _jf, job_tags: _jt, ...rest } = job;

  return {
    ...rest,
    career_areas: careerAreas,
    experience_levels: experienceLevels,
    employment_types: employmentTypes,
    work_arrangements: workArrangements,
    tags,
  };
}

export function jobListSelect() {
  return JOB_SEMANTIC_SELECT;
}

/**
 * Job IDs that have any of the given facet values for a type (OR semantics).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} facetType
 * @param {string[]} facetValues
 * @returns {Promise<string[]|null>} null = no filter / tables missing; [] = no matches
 */
export async function resolveJobIdsByFacetValues(supabase, facetType, facetValues) {
  if (!facetValues?.length) return null;

  const { data, error } = await supabase
    .from('job_facets')
    .select('job_id, facets!inner(facet_type, facet_value)')
    .eq('facets.facet_type', facetType)
    .in('facets.facet_value', facetValues);

  if (error) {
    // Tables may not be migrated yet — fall back to legacy columns upstream
    if (isMissingRelation(error)) return null;
    throw error;
  }

  return [...new Set((data || []).map((row) => row.job_id))];
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} careerAreas
 */
export async function resolveJobIdsByCareerAreas(supabase, careerAreas) {
  return resolveJobIdsByFacetValues(supabase, 'career_area', careerAreas);
}

/**
 * Job IDs whose tags match a search term (employer or AI provenance).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} q
 * @returns {Promise<string[]>}
 */
export async function resolveJobIdsByTagQuery(supabase, q) {
  if (!q?.trim()) return [];

  const term = q.trim();
  const { data: tags, error: tagError } = await supabase
    .from('tags')
    .select('id')
    .or(`tag_name.ilike.%${escapeIlike(term)}%,tag_slug.ilike.%${escapeIlike(slugify(term))}%`)
    .limit(50);

  if (tagError) {
    if (isMissingRelation(tagError)) return [];
    throw tagError;
  }

  if (!tags?.length) return [];

  const { data: links, error: linkError } = await supabase
    .from('job_tags')
    .select('job_id')
    .in(
      'tag_id',
      tags.map((t) => t.id),
    );

  if (linkError) {
    if (isMissingRelation(linkError)) return [];
    throw linkError;
  }

  return [...new Set((links || []).map((row) => row.job_id))];
}

function isMissingRelation(error) {
  const message = error?.message || '';
  return (
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('Could not find the table')
  );
}

function escapeIlike(value) {
  return String(value).replace(/[%_,]/g, '\\$&');
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
