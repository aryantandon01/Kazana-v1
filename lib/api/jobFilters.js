import { patternsForCountry, COUNTRY_LOCATION_ALIASES } from '@/lib/geo/countries';

export { COUNTRY_LOCATION_ALIASES };

/** Freshness window presets → milliseconds lookback (null = all time). */
export const FRESHNESS_WINDOWS = {
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  today: 'today',
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  all: null,
};

export const FRESHNESS_OPTIONS = [
  { value: '15m', label: 'Last 15 minutes' },
  { value: '30m', label: 'Last 30 minutes' },
  { value: '1h', label: 'Last hour' },
  { value: '6h', label: 'Last 6 hours' },
  { value: 'today', label: 'Today' },
  { value: '3d', label: 'Last 3 days' },
  { value: '7d', label: 'Last week' },
  { value: 'all', label: 'All Time' },
];

/**
 * @param {URLSearchParams} searchParams
 */
export function parseJobFilters(searchParams) {
  const companies = searchParams.getAll('company').filter(Boolean);
  const countries = searchParams.getAll('country').filter(Boolean);
  const careerAreas = [
    ...searchParams.getAll('career_area').filter(Boolean),
    ...splitCsv(searchParams.get('career_areas')),
  ];
  const q = searchParams.get('q')?.trim() || '';
  const jobFamily = searchParams.get('job_family')?.trim() || '';
  const level = searchParams.get('level')?.trim() || '';
  const experienceLevel = searchParams.get('experience_level')?.trim() || '';
  const yearsMin = searchParams.get('years_min');
  const yearsMax = searchParams.get('years_max');
  const remoteOnly = searchParams.get('remote') === 'true';
  const freshness = searchParams.get('freshness')?.trim() || 'all';
  const sinceVisit = searchParams.get('since_visit') === 'true';

  return {
    companies: companies.length ? companies : splitCsv(searchParams.get('companies')),
    countries: countries.length ? countries : splitCsv(searchParams.get('countries')),
    careerAreas: [...new Set(careerAreas)],
    q,
    jobFamily,
    level,
    experienceLevel,
    yearsMin: yearsMin ? Number.parseInt(yearsMin, 10) : null,
    yearsMax: yearsMax ? Number.parseInt(yearsMax, 10) : null,
    remoteOnly,
    freshness: freshness in FRESHNESS_WINDOWS ? freshness : 'all',
    sinceVisit,
  };
}

function splitCsv(value) {
  if (!value) return [];
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}

/**
 * @param {string} freshness
 * @returns {string|null} ISO cutoff for discovered_at / last_updated_at
 */
export function freshnessCutoffIso(freshness) {
  const window = FRESHNESS_WINDOWS[freshness];
  if (window == null) return null;

  if (window === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }

  return new Date(Date.now() - window).toISOString();
}

/**
 * @param {import('@supabase/supabase-js').PostgrestFilterBuilder} query
 * @param {ReturnType<typeof parseJobFilters>} filters
 * @param {{
 *   lastJobsVisitAt?: string|null,
 *   facetJobIds?: string[]|null,
 *   tagSearchJobIds?: string[],
 * }} [context]
 */
export function applyJobFilters(query, filters, context = {}) {
  let next = query.is('expires_at', null);

  if (context.facetJobIds != null) {
    if (context.facetJobIds.length === 0) {
      // Force empty result set
      next = next.eq('id', '00000000-0000-0000-0000-000000000000');
    } else {
      next = next.in('id', context.facetJobIds);
    }
  } else if (filters.jobFamily) {
    // Legacy fallback when semantic tables are unavailable
    next = next.eq('job_family', filters.jobFamily);
  }

  // Experience / L-level: only apply column filter when facet join was unavailable
  if (context.facetJobIds == null) {
    if (filters.experienceLevel) {
      next = next.eq('level', experienceToLegacyLevel(filters.experienceLevel) || filters.experienceLevel);
    } else if (filters.level) {
      next = next.eq('level', filters.level);
    }
  } else if (filters.level && !filters.experienceLevel && !filters.careerAreas?.length) {
    next = next.eq('level', filters.level);
  }

  // Harden experience filters: misclassified facets still leak senior titles / high YOE
  if (filters.experienceLevel) {
    next = applyExperienceGuards(next, filters.experienceLevel);
  }

  if (filters.companies.length === 1) {
    next = next.eq('company_name', filters.companies[0]);
  } else if (filters.companies.length > 1) {
    next = next.in('company_name', filters.companies);
  }

  if (filters.yearsMin != null && !Number.isNaN(filters.yearsMin)) {
    next = next.gte('years_required', filters.yearsMin);
  }

  if (filters.yearsMax != null && !Number.isNaN(filters.yearsMax)) {
    next = next.lte('years_required', filters.yearsMax);
  }

  if (filters.remoteOnly) {
    next = next.or('location.ilike.%remote%,location.ilike.%worldwide%,location.ilike.%anywhere%');
  }

  if (filters.countries.length > 0) {
    const patterns = [
      ...new Set(filters.countries.flatMap((country) => patternsForCountry(country))),
    ];
    const orClause = patterns.map((pattern) => `location.ilike.%${escapeIlike(pattern)}%`).join(',');
    next = next.or(orClause);
  }

  if (filters.q) {
    const term = escapeIlike(filters.q.trim());
    // Avoid description.ilike — full-text scan times out on large job tables.
    // Title/company/location + optional tag id matches cover discovery search.
    const textOr = [
      `title.ilike.%${term}%`,
      `company_name.ilike.%${term}%`,
      `location.ilike.%${term}%`,
      `job_family.ilike.%${term}%`,
    ];
    const tagIds = context.tagSearchJobIds || [];
    if (tagIds.length > 0) {
      const capped = tagIds.slice(0, 200);
      textOr.push(`id.in.(${capped.join(',')})`);
    }
    next = next.or(textOr.join(','));
  }

  if (filters.sinceVisit && context.lastJobsVisitAt) {
    next = next.gt('discovered_at', context.lastJobsVisitAt);
  } else {
    const cutoff = freshnessCutoffIso(filters.freshness);
    if (cutoff) {
      // Match jobs newly discovered OR meaningfully updated in the window
      next = next.or(`discovered_at.gte.${cutoff},last_updated_at.gte.${cutoff}`);
    }
  }

  return next;
}

/**
 * @param {string} sort
 * @param {boolean} ascending
 */
export function resolveJobSort(sort, ascending) {
  const map = {
    discovered_at: { field: 'discovered_at', ascending, mode: 'column' },
    last_updated_at: { field: 'last_updated_at', ascending, mode: 'updated' },
    posted_at: { field: 'posted_at', ascending, mode: 'column' },
    company_name: { field: 'company_name', ascending, mode: 'column' },
    title: { field: 'title', ascending, mode: 'column' },
    best_match: { field: 'score', ascending: false, mode: 'best_match' },
  };

  return map[sort] || { field: 'discovered_at', ascending: false, mode: 'column' };
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

/** Soft years ceilings so mid/entry filters don't surface 8–10+ YOE senior roles. */
const EXPERIENCE_YEARS_MAX = {
  intern: 1,
  new_grad: 2,
  entry: 3,
  mid: 6,
  senior: 10,
  staff: 14,
  principal: 20,
  director: null,
};

/** Title tokens that imply a higher band than the selected filter. */
const EXPERIENCE_TITLE_EXCLUSIONS = {
  intern: ['senior', 'staff', 'principal', 'director', 'lead'],
  new_grad: ['senior', 'staff', 'principal', 'director'],
  entry: ['senior', 'staff', 'principal', 'director'],
  mid: ['senior', 'staff', 'principal', 'director', 'distinguished'],
  senior: ['staff', 'principal', 'director', 'distinguished'],
  staff: ['principal', 'director', 'distinguished'],
  principal: ['director', 'vp', 'vice president'],
  director: [],
};

function applyExperienceGuards(query, experienceLevel) {
  let next = query;
  const maxYears = EXPERIENCE_YEARS_MAX[experienceLevel];
  if (maxYears != null) {
    // not.gt keeps NULL years_required (unknown) while dropping 8+/10+ YOE roles
    next = next.not('years_required', 'gt', maxYears);
  }

  for (const token of EXPERIENCE_TITLE_EXCLUSIONS[experienceLevel] || []) {
    next = next.not('title', 'ilike', `%${token}%`);
  }

  return next;
}

function escapeIlike(value) {
  return value.replace(/[%_,]/g, '\\$&');
}
