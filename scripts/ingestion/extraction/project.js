/**
 * Project canonical extraction onto job_facets / job_tags.
 */

import { persistJobClassification } from '../classification/persist.js';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} jobId
 * @param {{ canonical: import('./types.js').CanonicalJob, extraction: Record<string, import('./types.js').ExtractionResult> }} result
 */
export async function projectExtractionToFacetsTags(supabase, jobId, result) {
  const { canonical, extraction } = result;
  const conf = (field, fallback = 0.8) => extraction[field]?.confidence ?? fallback;
  const sourceOf = (field) => {
    const s = extraction[field]?.source;
    if (s === 'structured') return 'classifier';
    return 'classifier';
  };

  const careerAreas = (canonical.careerAreas || []).map((value) => ({
    facet_type: 'career_area',
    facet_value: value,
    label: labelize(value),
    confidence: conf('careerAreas'),
  }));

  const experienceLevels = canonical.experienceLevel
    ? [
        {
          facet_type: 'experience_level',
          facet_value: canonical.experienceLevel,
          label: labelize(canonical.experienceLevel),
          confidence: conf('experienceLevel'),
        },
      ]
    : [];

  const employmentTypes = canonical.employmentType
    ? [
        {
          facet_type: 'employment_type',
          facet_value: canonical.employmentType,
          label: labelize(canonical.employmentType),
          confidence: conf('employmentType'),
        },
      ]
    : [];

  const workArrangements = canonical.workArrangement
    ? [
        {
          facet_type: 'work_arrangement',
          facet_value: canonical.workArrangement,
          label: labelize(canonical.workArrangement),
          confidence: conf('workArrangement'),
        },
      ]
    : [];

  const company = canonical.company
    ? [
        {
          facet_type: 'company',
          facet_value: slugify(canonical.company),
          label: canonical.company,
          confidence: conf('company', 0.95),
        },
      ]
    : [];

  const required = (canonical.requiredSkills || []).map((name) => ({
    tag_name: name,
    tag_slug: slugify(name),
    tag_category: 'skill',
    tag_source: extraction.requiredSkills?.source === 'structured' ? 'employer' : 'ai',
    confidence_score: conf('requiredSkills'),
  }));

  const preferred = (canonical.preferredSkills || []).map((name) => ({
    tag_name: name,
    tag_slug: slugify(name),
    tag_category: 'skill',
    tag_source: 'ai',
    confidence_score: Math.min(conf('preferredSkills', 0.7), 0.75),
  }));

  const tech = (canonical.technologies || [])
    .filter((t) => !(canonical.requiredSkills || []).includes(t))
    .map((name) => ({
      tag_name: name,
      tag_slug: slugify(name),
      tag_category: 'technology',
      tag_source: 'ai',
      confidence_score: conf('technologies', 0.7),
    }));

  const classification = {
    facets: {
      career_area: careerAreas,
      experience_level: experienceLevels,
      employment_type: employmentTypes,
      work_arrangement: workArrangements,
      company,
      location: [],
    },
    tags: {
      employer: required.filter((t) => t.tag_source === 'employer'),
      ai: [
        ...required.filter((t) => t.tag_source === 'ai'),
        ...preferred,
        ...tech,
      ],
    },
    legacy: {
      job_family: canonical.jobFamily,
      level: canonical.legacyLevel,
    },
  };

  // silence unused
  void sourceOf;

  await persistJobClassification(supabase, jobId, classification);
}

function labelize(value) {
  return String(value)
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/\+/g, 'p')
    .replace(/#/g, 'sharp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
