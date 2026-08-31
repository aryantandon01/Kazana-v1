import {
  CAREER_AREA_RULES,
  CAREER_AREA_TO_LEGACY_FAMILY,
  EMPLOYMENT_TYPE_RULES,
  EXPERIENCE_LEVEL_RULES,
  LEGACY_LEVEL_TO_EXPERIENCE,
  TAG_LEXICON,
  WORK_ARRANGEMENT_RULES,
} from './catalog.js';

/**
 * Classify a normalized job into multi-valued Facets and Tags.
 *
 * @param {{ title?: string, description?: string, location?: string, company_name?: string, level?: string|null, tags?: string[] }} job
 */
export function classifyJob(job) {
  const title = job.title || '';
  const description = job.description || '';
  const location = job.location || '';
  const haystack = `${title}\n${description}\n${location}\n${(job.tags || []).join(' ')}`;

  const careerAreas = enrichCareerAreas(matchAll(CAREER_AREA_RULES, haystack, title), title, haystack);
  const experienceLevels = matchExperience(haystack, title, job.level);
  const employmentTypes = matchEmployment(haystack, title);
  const workArrangements = matchWorkArrangement(haystack, location);

  const employerTags = extractEmployerTags(haystack);
  const aiTags = inferAiTags(haystack, careerAreas, employerTags);

  const primaryCareer = careerAreas[0]?.facet_value;
  const primaryExperience = experienceLevels[0]?.facet_value;
  const mappedFamily =
    primaryCareer && Object.prototype.hasOwnProperty.call(CAREER_AREA_TO_LEGACY_FAMILY, primaryCareer)
      ? CAREER_AREA_TO_LEGACY_FAMILY[primaryCareer]
      : undefined;

  return {
    facets: {
      career_area: careerAreas,
      experience_level: experienceLevels,
      employment_type: employmentTypes,
      work_arrangement: workArrangements,
      company: job.company_name ? [slugifyCompany(job.company_name)] : [],
      location: extractLocationFacets(location),
    },
    tags: {
      employer: employerTags,
      ai: aiTags,
    },
    /** Keep legacy columns usable until full cutover */
    legacy: {
      job_family: mappedFamily !== undefined ? mappedFamily : job.job_family || null,
      level: experienceToLegacyLevel(primaryExperience) || job.level || null,
    },
  };
}

/**
 * ML/AI engineer roles typically span Backend as well (product model: multi career areas).
 */
function enrichCareerAreas(areas, title, haystack) {
  const values = new Set(areas.map((a) => a.facet_value));
  const isEngineer = /\bengineer\b/i.test(title) || /\bengineering\b/i.test(title);

  if (isEngineer && (values.has('machine_learning') || values.has('ai')) && !values.has('backend')) {
    areas.push({
      facet_type: 'career_area',
      facet_value: 'backend',
      label: 'Backend',
      confidence: 0.65,
    });
  }

  if (/\bfull[- ]?stack\b/i.test(title) || /\bfull[- ]?stack\b/i.test(haystack)) {
    if (!values.has('frontend')) {
      areas.push({
        facet_type: 'career_area',
        facet_value: 'frontend',
        label: 'Frontend',
        confidence: 0.7,
      });
    }
    if (!values.has('backend')) {
      areas.push({
        facet_type: 'career_area',
        facet_value: 'backend',
        label: 'Backend',
        confidence: 0.7,
      });
    }
  }

  return dedupeByValue(areas);
}

function matchAll(rules, haystack, title) {
  const hits = [];
  for (const rule of rules) {
    const inTitle = rule.patterns.some((p) => p.test(title));
    const inBody = rule.patterns.some((p) => p.test(haystack));
    if (inTitle || inBody) {
      hits.push({
        facet_type: 'career_area',
        facet_value: rule.value,
        label: rule.label,
        // Title beats body so "Administrative Coordinator" isn't ranked under a body false positive
        confidence: inTitle ? 0.95 : 0.75,
        _title: inTitle,
      });
    }
  }
  hits.sort((a, b) => Number(b._title) - Number(a._title) || b.confidence - a.confidence);
  return dedupeByValue(hits).map(({ _title, ...rest }) => rest);
}

function matchExperience(haystack, title, legacyLevel) {
  // Prefer title signals — JD bodies often mention multiple bands (e.g. "mid-level IC track")
  const fromTitle = firstExperienceMatch(title);
  if (fromTitle) return [fromTitle];

  const fromBody = firstExperienceMatch(haystack);
  if (fromBody) return [fromBody];

  if (legacyLevel && LEGACY_LEVEL_TO_EXPERIENCE[legacyLevel]) {
    const value = LEGACY_LEVEL_TO_EXPERIENCE[legacyLevel];
    const rule = EXPERIENCE_LEVEL_RULES.find((r) => r.value === value);
    return [
      {
        facet_type: 'experience_level',
        facet_value: value,
        label: rule?.label || value,
        confidence: 0.7,
      },
    ];
  }

  return [];
}

function firstExperienceMatch(text) {
  if (!text) return null;
  for (const rule of EXPERIENCE_LEVEL_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return {
        facet_type: 'experience_level',
        facet_value: rule.value,
        label: rule.label,
        confidence: 0.9,
      };
    }
  }
  return null;
}

function matchEmployment(haystack, title) {
  for (const rule of EMPLOYMENT_TYPE_RULES) {
    if (rule.patterns.some((p) => p.test(title) || p.test(haystack))) {
      return [
        {
          facet_type: 'employment_type',
          facet_value: rule.value,
          label: rule.label,
          confidence: 0.9,
        },
      ];
    }
  }
  return [
    {
      facet_type: 'employment_type',
      facet_value: 'full_time',
      label: 'Full Time',
      confidence: 0.4,
    },
  ];
}

function matchWorkArrangement(haystack, location) {
  const hits = [];
  for (const rule of WORK_ARRANGEMENT_RULES) {
    if (rule.patterns.some((p) => p.test(haystack) || p.test(location))) {
      hits.push({
        facet_type: 'work_arrangement',
        facet_value: rule.value,
        label: rule.label,
        confidence: 0.9,
      });
    }
  }
  return dedupeByValue(hits);
}

function extractEmployerTags(haystack) {
  const tags = [];
  for (const entry of TAG_LEXICON) {
    if (entry.patterns.some((p) => p.test(haystack))) {
      tags.push({
        tag_name: entry.name,
        tag_slug: entry.slug,
        tag_category: entry.category,
        tag_source: 'employer',
        confidence_score: 0.95,
      });
    }
  }
  return dedupeTags(tags);
}

/**
 * Lightweight "AI" inferences: expand from co-occurrence / career areas.
 * Stored with tag_source = 'ai' separately from employer mentions.
 */
function inferAiTags(haystack, careerAreas, employerTags) {
  const inferred = [];
  const employerSlugs = new Set(employerTags.map((t) => t.tag_slug));
  const areas = new Set(careerAreas.map((a) => a.facet_value));

  const push = (slug, name, category, confidence) => {
    if (employerSlugs.has(slug)) return;
    inferred.push({
      tag_name: name,
      tag_slug: slug,
      tag_category: category,
      tag_source: 'ai',
      confidence_score: confidence,
    });
  };

  if (areas.has('backend') || /\bapi\b/i.test(haystack)) {
    push('distributed-systems', 'Distributed Systems', 'domain', 0.55);
    push('microservices', 'Microservices', 'domain', 0.5);
  }
  if (areas.has('cloud') || /\bcloud infrastructure\b/i.test(haystack)) {
    push('aws', 'AWS', 'cloud', 0.45);
    push('azure', 'Azure', 'cloud', 0.45);
    push('gcp', 'GCP', 'cloud', 0.45);
  }
  if (areas.has('ai') || areas.has('machine_learning')) {
    push('llms', 'LLMs', 'ai', 0.5);
    if (/\bpython\b/i.test(haystack)) push('pytorch', 'PyTorch', 'ai', 0.45);
  }
  if (/\bcloud\b/i.test(haystack) && areas.has('backend')) {
    push('kubernetes', 'Kubernetes', 'infrastructure', 0.4);
  }

  return dedupeTags(inferred);
}

function extractLocationFacets(location) {
  if (!location) return [];
  const parts = location
    .split(/[;|/]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 5);

  return parts.map((part) => ({
    facet_type: 'location',
    facet_value: slugify(part),
    label: part,
    confidence: 0.8,
  }));
}

function slugifyCompany(name) {
  return slugify(name);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

function experienceToLegacyLevel(value) {
  const map = {
    intern: 'L1',
    new_grad: 'L2',
    entry: 'L2',
    mid: 'L4',
    senior: 'L5',
    staff: 'L6',
    principal: 'L7',
    director: 'L8',
  };
  return map[value] || null;
}

function dedupeByValue(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.facet_value;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeTags(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.tag_slug}:${item.tag_source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
