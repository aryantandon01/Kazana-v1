/**
 * Modular recommendation signals.
 * Each returns { score: 0..1, evidence: {...} } for explainability.
 */

import {
  ADJACENT_CATEGORIES,
  ADJACENT_SCORE,
  EXPERIENCE_RANK,
  FAMILY_CLUSTERS,
  FAMILY_SCORES,
  FAMILY_SKILL_PRIORS,
  FAMILY_TO_CAREER_AREAS,
  IC_CATEGORIES,
  JOB_BAND_MIN_YEARS,
  LEVEL_TO_EXPERIENCE,
} from './weights.js';
import { scoreGeoProximity, extractCity, inferCountryFromLocation } from '../geo/countries.js';

export function scoreSkills(job, resume) {
  const jobSkills = extractJobSkills(job);
  const resumeSkills = inferResumeSkills(resume);

  if (!jobSkills.length) {
    // Missing tags must not look like a perfect skill fit
    return { score: 0.35, evidence: { matched: [], missing: [], jobSkills: [], resumeSkills } };
  }

  if (!resumeSkills.length) {
    return {
      score: 0.35,
      evidence: {
        matched: [],
        missing: jobSkills.slice(0, 6),
        jobSkills,
        resumeSkills,
        note: 'limited_resume_skills',
      },
    };
  }

  const resumeSet = new Set(resumeSkills.map(normalizeSkill));
  const matched = [];
  const missing = [];

  for (const skill of jobSkills) {
    if (resumeSet.has(normalizeSkill(skill))) matched.push(skill);
    else missing.push(skill);
  }

  const overlap = matched.length / jobSkills.length;
  // Required tags (employer) already preferred in extractJobSkills order
  const score = Math.min(1, 0.25 + overlap * 0.75);

  return {
    score,
    evidence: {
      matched: matched.slice(0, 8),
      missing: missing.slice(0, 6),
      jobSkills,
      resumeSkills,
    },
  };
}

/**
 * Job family proximity — explicit comparison of resume family vs job family
 * (both derived from the canonical 58-family JOB_FAMILY_GROUPS).
 */
export function scoreJobFamily(job, resume) {
  const resumeFamily = String(resume?.job_family || '').toLowerCase();
  const jobFamily = String(job?.job_family || job?.jobFamily || '').toLowerCase();

  if (!resumeFamily || !jobFamily) {
    return { score: 0.45, evidence: { note: 'missing_family' } };
  }
  if (resumeFamily === jobFamily) {
    return { score: FAMILY_SCORES.exactMatch, evidence: { resumeFamily, jobFamily, match: 'exact' } };
  }

  const resumeCluster = FAMILY_CLUSTERS[resumeFamily];
  const jobCluster = FAMILY_CLUSTERS[jobFamily];
  if (!resumeCluster || !jobCluster) {
    return { score: 0.45, evidence: { note: 'unknown_family', resumeFamily, jobFamily } };
  }

  const resumeIsIC = IC_CATEGORIES.has(resumeCluster);
  const jobIsIC = IC_CATEGORIES.has(jobCluster);

  if (resumeCluster === jobCluster) {
    if (resumeIsIC === jobIsIC) {
      return { score: FAMILY_SCORES.sameClusterSameType, evidence: { resumeFamily, jobFamily, resumeCluster, match: 'same_cluster_same_type' } };
    }
    return { score: FAMILY_SCORES.sameClusterMixedType, evidence: { resumeFamily, jobFamily, resumeCluster, match: 'same_cluster_mixed_type' } };
  }

  const isAdjacent = ADJACENT_CATEGORIES.some(
    ([a, b]) => (a === resumeCluster && b === jobCluster) || (a === jobCluster && b === resumeCluster)
  );
  if (isAdjacent) {
    return { score: ADJACENT_SCORE, evidence: { resumeFamily, jobFamily, resumeCluster, jobCluster, match: 'adjacent_category' } };
  }

  if (resumeIsIC === jobIsIC) {
    return { score: FAMILY_SCORES.differentClusterSameType, evidence: { resumeFamily, jobFamily, resumeCluster, jobCluster, match: 'different_cluster_same_type' } };
  }
  if (resumeCluster === 'engineering_management' || jobCluster === 'engineering_management') {
    return { score: FAMILY_SCORES.crossDomain, evidence: { resumeFamily, jobFamily, resumeCluster, jobCluster, match: 'cross_domain_ic_mgmt' } };
  }
  return { score: FAMILY_SCORES.crossCategory, evidence: { resumeFamily, jobFamily, resumeCluster, jobCluster, match: 'cross_category' } };
}

export function scoreCareerAreas(job, resume, profile) {
  const jobAreas = getJobCareerAreas(job);
  const candidateAreas = getCandidateCareerAreas(resume, profile);

  if (!jobAreas.length) return { score: 0.35, evidence: { matched: [], jobAreas, candidateAreas } };
  if (!candidateAreas.length) return { score: 0.4, evidence: { matched: [], jobAreas, candidateAreas } };

  const candidateSet = new Set(candidateAreas);
  const matched = jobAreas.filter((a) => candidateSet.has(a));
  if (!matched.length) {
    return { score: 0.12, evidence: { matched: [], jobAreas, candidateAreas } };
  }
  const score = matched.length / jobAreas.length;

  return {
    score: Math.min(1, 0.4 + score * 0.6),
    evidence: { matched, jobAreas, candidateAreas },
  };
}

/**
 * Experience fit — YOE gap is primary, level gap is secondary.
 *
 * Ideal: same YOE or slightly more than required, and one level above the JD
 * (else same level). Two+ levels above hurts; one level below hurts more.
 */
export function scoreExperience(job, resume) {
  const years = resume.years_of_experience ?? resume.years;
  let required = inferYearsRequired(job);
  const resumeBand = resolveResumeExperienceBand(resume);
  const jobBand = resolveJobExperienceBand(job);

  // If the JD doesn't state a years_required but the role band is known
  // (e.g. Staff/Senior in the title), infer a conservative minimum so the
  // shortfall is penalized — otherwise unknown YOE auto-floats experience
  // and lets senior roles match entry resumes.
  if (required == null && jobBand) {
    required = JOB_BAND_MIN_YEARS[jobBand];
  }
  const inferredRequired = required ?? null;

  if (!resumeBand && years == null) {
    return { score: 0.45, evidence: { note: 'missing_experience' } };
  }

  const yearsScore = scoreYearsFit(years, inferredRequired);
  const levelScore = scoreLevelFit(resumeBand, jobBand);

  const YEARS_WEIGHT = 0.7;
  const LEVEL_WEIGHT = 0.3;

  let score;
  let method;
  if (yearsScore != null && levelScore != null) {
    score = YEARS_WEIGHT * yearsScore + LEVEL_WEIGHT * levelScore;
    method = 'years_primary_level_secondary';
  } else if (yearsScore != null) {
    score = yearsScore;
    method = 'years_only';
  } else if (levelScore != null) {
    score = levelScore;
    method = 'level_only';
  } else {
    score = 0.45;
    method = 'fallback';
  }

  return {
    score: round3(score),
    evidence: {
      resume_level: resume.level || null,
      resume_experience: resumeBand,
      job_experience: jobBand,
      years: years ?? null,
      years_required: required,
      years_score: yearsScore != null ? round3(yearsScore) : null,
      level_score: levelScore != null ? round3(levelScore) : null,
      level_delta:
        resumeBand && jobBand ? rankOf(resumeBand) - rankOf(jobBand) : null,
      method,
    },
  };
}

/** Map YOE → coarse band (fallback when L-level / title missing). */
function bandFromYears(years) {
  if (years == null || Number.isNaN(Number(years))) return null;
  const y = Number(years);
  if (y <= 0) return 'intern';
  if (y <= 1) return 'new_grad';
  if (y <= 3) return 'entry';
  if (y <= 6) return 'mid';
  if (y <= 9) return 'senior';
  if (y <= 13) return 'staff';
  if (y <= 18) return 'principal';
  return 'director';
}

function resolveResumeExperienceBand(resume) {
  // Prefer explicit L-level so YOE stays an independent primary signal
  const fromLevel = LEVEL_TO_EXPERIENCE[String(resume.level || '').toUpperCase()] || null;
  if (fromLevel) return fromLevel;
  return bandFromYears(resume.years_of_experience ?? resume.years);
}

function resolveJobExperienceBand(job) {
  const fromTitle = inferExperienceFromTitle(job?.title);
  const fromFacet = getJobExperience(job);
  // Do not use years_required here — years are scored separately as the primary signal
  return highestBand([fromTitle, fromFacet]);
}

function inferExperienceFromTitle(title) {
  if (!title) return null;
  const t = String(title);
  if (/\b(director|head of|vice president|\bvp\b)\b/i.test(t)) return 'director';
  if (/\b(principal|distinguished)\b/i.test(t)) return 'principal';
  if (/\bstaff\b/i.test(t)) return 'staff';
  if (/\b(senior|sr\.?)\b/i.test(t)) return 'senior';
  if (/\b(engineering manager|eng(?:ineering)? manager)\b/i.test(t)) return 'senior';
  if (/\b(mid[- ]level|intermediate)\b/i.test(t)) return 'mid';
  if (/\b(junior|entry[- ]level|early career)\b/i.test(t)) return 'entry';
  if (/\b(new grad|university grad|recent graduate)\b/i.test(t)) return 'new_grad';
  if (/\bintern(ship)?\b/i.test(t)) return 'intern';
  return null;
}

function highestBand(bands) {
  const present = bands.filter(Boolean);
  if (!present.length) return null;
  return present.reduce((best, band) => (rankOf(band) > rankOf(best) ? band : best));
}

function rankOf(band) {
  return EXPERIENCE_RANK[band] ?? 0;
}

/**
 * Level fit (secondary).
 * delta = resumeRank - jobRank
 *  +1 (one level higher) → ideal 1.0
 *   0 (same level)       → strong 0.9
 *  +2 or more            → negative (overqualified)
 *  -1 (one below)        → worse than +2
 *  -2 or more            → very poor
 * @returns {number|null}
 */
/**
 * Level fit (secondary) — geometric, asymmetric decay.
 *   +1 one above → 1.0 (ideal), 0 same → 0.9
 *   +2+ above    → 0.9 * 0.6^(delta-1)  (overqualified decays)
 *   -1 one below → 0.45  (underqualified punished harder than overqualified)
 *   -2+ below    → 0.45 * 0.45^(abs(delta)-1)  (approaches ~0 for 5+ gaps)
 */
function scoreLevelFit(resumeBand, jobBand) {
  if (!resumeBand || !jobBand) return null;
  const delta = rankOf(resumeBand) - rankOf(jobBand);

  if (delta === 1) return 1.0;
  if (delta === 0) return 0.9;
  if (delta >= 2) return Math.max(0.05, 0.9 * Math.pow(0.6, delta - 1));
  if (delta === -1) return 0.45;
  return Math.max(0.01, 0.45 * Math.pow(0.45, Math.abs(delta) - 1));
}

/**
 * Years fit (primary).
 * Ideal: same YOE or slightly more than required (+0..+2).
 * Under-requirement is penalized harder than mild over-requirement.
 * @returns {number|null}
 */
/**
 * Years fit (primary) — geometric decay on shortfall, gentle linear on surplus.
 *   same or +1 → 1.0, +2 → 0.96, then -0.04/yr to a 0.5 floor (overqualified fine)
 *   short 1 → 0.65, short 2 → 0.42, short 3 → 0.2, then 0.5^n toward ~0.01
 */
function scoreYearsFit(years, required) {
  if (years == null && required == null) return null;
  if (years == null) return 0.35;
  // Unknown requirement must not auto-float the signal — cap at 0.5 and let
  // the level band carry the fit.
  if (required == null) return 0.5;

  const surplus = years - required; // >0 = more experience than required

  if (surplus >= 0) {
    if (surplus <= 1) return 1.0;
    return Math.max(0.5, 1.0 - (surplus - 1) * 0.04);
  }

  const short = -surplus; // years short of requirement
  if (short === 1) return 0.65;
  if (short === 2) return 0.42;
  if (short === 3) return 0.2;
  // geometric: 0.2 * 0.5^(short-3) → 0.1, 0.05, 0.025, ...
  return Math.max(0.01, 0.2 * Math.pow(0.5, short - 3));
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * Semantic fit between resume profile and job.
 *
 * Uses overlap of focused profile terms (family, career areas, skills) against
 * job title/tags/areas — not raw cosine vs the full JD body (that stays near 0
 * because resume metadata is tiny and descriptions are mostly boilerplate).
 */
export function scoreSemantic(job, resume) {
  const resumeTerms = buildResumeTerms(resume);
  const jobTerms = buildJobTerms(job);

  if (!resumeTerms.length || !jobTerms.length) {
    return { score: 0.4, evidence: { method: 'term_overlap', note: 'insufficient_text' } };
  }

  const jobSet = new Set(jobTerms);
  const hits = resumeTerms.filter((t) => jobSet.has(t));
  // Overlap coefficient: share of the smaller set covered (resume is usually smaller)
  const coverage = hits.length / Math.min(resumeTerms.length, jobSet.size);
  const resumeCoverage = hits.length / resumeTerms.length;

  // Title cue: role words from resume family appearing in the job title
  const title = tokenize(job.title || '');
  const titleSet = new Set(title);
  const familyTerms = expandFamily(resume.job_family);
  const titleHits = familyTerms.filter((t) => titleSet.has(t)).length;
  const titleBoost = familyTerms.length
    ? Math.min(0.25, (titleHits / familyTerms.length) * 0.35)
    : 0;

  // Blend: resume coverage dominates; light title boost for clear role matches
  const raw = Math.min(1, 0.75 * resumeCoverage + 0.25 * coverage + titleBoost);
  // Mild stretch so related roles land mid/high instead of clustering near 0.1–0.2
  const score = round3(Math.min(1, Math.sqrt(raw)));

  return {
    score,
    evidence: {
      method: 'term_overlap',
      resume_terms: resumeTerms.length,
      job_terms: jobTerms.length,
      hits: hits.length,
      resume_coverage: round3(resumeCoverage),
      title_boost: round3(titleBoost),
      matched: hits.slice(0, 12),
    },
  };
}

/**
 * Graduated location fit (replaces boolean same-country signal):
 * same city → 1.0, same country → 0.8, same continent → 0.25, else → 0.
 */
export function scoreLocation(job, resume, profile) {
  const loc = (job.location || '').toLowerCase();
  const arrangements = (job.work_arrangements || []).map((a) => a.value || a);

  if (profile?.remote_only) {
    const remote =
      loc.includes('remote') ||
      loc.includes('worldwide') ||
      loc.includes('anywhere') ||
      arrangements.includes('remote');
    return {
      score: remote ? 1 : 0.15,
      evidence: { preference: 'remote_only', remote, match: remote ? 'remote' : 'not_remote' },
    };
  }

  const userCountry =
    resume?.country ||
    inferCountryFromLocation(profile?.location) ||
    null;
  const userCity =
    extractCity(profile?.location) ||
    extractCity(resume?.city) ||
    extractCity(resume?.location) ||
    null;

  if (!userCountry && !userCity) {
    return { score: 0.4, evidence: { match: 'no_user_location' } };
  }

  if (!job?.location) {
    return {
      score: 0,
      evidence: { match: 'no_job_location', city: userCity, country: userCountry },
    };
  }

  const geo = scoreGeoProximity(job.location, userCity, userCountry);

  // Soft bump when remote-friendly and we at least share a country/continent
  if (
    geo.score < 1 &&
    geo.score > 0 &&
    (arrangements.includes('remote') || loc.includes('remote'))
  ) {
    return {
      score: Math.min(1, geo.score + 0.05),
      evidence: { ...geo, remote_friendly: true },
    };
  }

  return { score: geo.score, evidence: geo };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractJobSkills(job) {
  const tags = job.tags || [];
  const employer = tags
    .filter((t) => t.source === 'employer' || !t.source)
    .map((t) => t.slug || t.name)
    .filter(Boolean);
  const candidates = employer.length
    ? employer
    : tags.map((t) => t.slug || t.name).filter(Boolean);
  return unique(candidates.map(normalizeSkill)).slice(0, 12);
}

function inferResumeSkills(resume) {
  const fromFamily = FAMILY_SKILL_PRIORS[resume.job_family] || [];
  // Future: resume.skills, parsed PDF skills, etc.
  const explicit = Array.isArray(resume.skills) ? resume.skills : [];
  return unique([...explicit.map(normalizeSkill), ...fromFamily]);
}

const ENG_CAREER_AREAS = new Set([
  'backend',
  'frontend',
  'full_stack',
  'ai',
  'machine_learning',
  'data',
  'devops',
  'cloud',
  'security',
  'hardware',
  'quantitative',
  'management',
]);

const NON_ENG_TITLE =
  /\b(administrative|administrator|executive assistant|office manager|receptionist|personal assistant|recruiter|talent acquisition|account executive|sales (?:associate|rep|representative)|customer success|marketing coordinator)\b/i;

function getJobCareerAreas(job) {
  const fromFacets = (job.career_areas || []).map((a) => a.value || a).filter(Boolean);
  const fromTitle = inferCareerAreasFromTitle(job.title);
  const titleAdmin = inferAdminCareerFromTitle(job.title);

  // Title clearly non-eng: do not inherit Backend/Full Stack from a bad job_family
  if (NON_ENG_TITLE.test(job.title || '') || titleAdmin.length) {
    const areas = unique([
      ...fromFacets.filter((a) => !ENG_CAREER_AREAS.has(a)),
      ...fromTitle.filter((a) => !ENG_CAREER_AREAS.has(a)),
      ...titleAdmin,
    ]);
    return areas.length ? areas : ['administration'];
  }

  const fromFamily =
    job.job_family && FAMILY_TO_CAREER_AREAS[job.job_family]
      ? FAMILY_TO_CAREER_AREAS[job.job_family]
      : [];
  return unique([...fromFacets, ...fromFamily, ...fromTitle]);
}

function inferAdminCareerFromTitle(title) {
  const t = String(title || '').toLowerCase();
  if (!t) return [];
  if (/\b(administrative|admin(?:istrative)? coordinator|executive assistant|office manager|receptionist|personal assistant)\b/.test(t)) {
    return ['administration'];
  }
  if (/\b(recruiter|talent acquisition|people ops)\b/.test(t)) return ['hr'];
  if (/\b(account executive|sales)\b/.test(t)) return ['sales'];
  return [];
}

function inferCareerAreasFromTitle(title) {
  const t = String(title || '').toLowerCase();
  if (!t) return [];
  if (/\b(machine learning|ml engineer|deep learning)\b/.test(t)) return ['machine_learning', 'ai'];
  if (/\b(ai |artificial intelligence|llm|genai|gen ai)\b/.test(t)) return ['ai', 'machine_learning'];
  if (/\b(data engineer|analytics engineer)\b/.test(t)) return ['data'];
  if (/\b(devops|sre|platform engineer|infrastructure)\b/.test(t)) return ['devops', 'cloud'];
  if (/\b(security|appsec|infosec)\b/.test(t)) return ['security'];
  if (/\b(product manager|product owner)\b/.test(t)) return ['product'];
  if (/\b(design|ux|ui)\b/.test(t)) return ['design'];
  if (/\b(frontend|front-end|front end)\b/.test(t)) return ['frontend', 'full_stack'];
  if (/\b(backend|back-end|back end|full.?stack|software engineer|software developer|swe)\b/.test(t)) {
    return ['backend', 'full_stack'];
  }
  return [];
}

function getCandidateCareerAreas(resume, profile) {
  const fromProfile = profile?.target_career_areas || profile?.target_job_families || [];
  const mapped = [];
  for (const item of fromProfile) {
    if (FAMILY_TO_CAREER_AREAS[item]) mapped.push(...FAMILY_TO_CAREER_AREAS[item]);
    else mapped.push(item);
  }
  if (resume.job_family && FAMILY_TO_CAREER_AREAS[resume.job_family]) {
    mapped.push(...FAMILY_TO_CAREER_AREAS[resume.job_family]);
  }
  return unique(mapped);
}

function getJobExperience(job) {
  const fromFacet = (job.experience_levels || [])[0];
  if (fromFacet) return fromFacet.value || fromFacet;
  return LEVEL_TO_EXPERIENCE[String(job.level || '').toUpperCase()] || null;
}

function inferYearsRequired(job) {
  if (job.years_required_min != null) return Number(job.years_required_min);
  if (job.years_required != null) return Number(job.years_required);
  return null;
}

function buildResumeTerms(resume) {
  const terms = [
    ...expandFamily(resume.job_family),
    ...(FAMILY_TO_CAREER_AREAS[resume.job_family] || []).flatMap(expandSlug),
    ...(inferResumeSkills(resume) || []).flatMap(expandSkill),
    ...(resume.companies || []).flatMap((c) => tokenize(c)),
  ];
  return unique(terms.filter((t) => t.length >= 2));
}

function buildJobTerms(job) {
  const nonEng = NON_ENG_TITLE.test(job.title || '') || inferAdminCareerFromTitle(job.title).length > 0;
  const structured = [
    ...tokenize(job.title),
    ...(nonEng ? [] : expandFamily(job.job_family)),
    ...(job.career_areas || [])
      .map((a) => a.value || a.label || a)
      .filter((v) => !(nonEng && ENG_CAREER_AREAS.has(String(v))))
      .flatMap(expandSlug),
    ...(job.tags || []).map((t) => t.slug || t.name || t).flatMap(expandSkill),
    ...inferAdminCareerFromTitle(job.title).flatMap(expandSlug),
  ];

  return unique(structured.filter((t) => t.length >= 2));
}

function expandFamily(family) {
  if (!family) return [];
  const slug = String(family).toLowerCase();
  const words = tokenize(slug.replace(/_/g, ' '));
  const extras = [];
  if (slug.includes('software') || slug.includes('engineer')) {
    extras.push('software', 'engineer', 'engineering', 'developer', 'swe', 'fullstack', 'full');
  }
  if (slug.includes('ai') || slug.includes('machine_learning') || slug.includes('ml')) {
    extras.push('ai', 'ml', 'machine', 'learning', 'llm');
  }
  if (slug.includes('data')) extras.push('data', 'analytics', 'etl');
  if (slug.includes('devops') || slug.includes('sre')) extras.push('devops', 'sre', 'infrastructure', 'platform');
  if (slug.includes('product')) extras.push('product', 'pm');
  if (slug.includes('design')) extras.push('design', 'designer', 'ux', 'ui');
  if (slug.includes('security')) extras.push('security', 'appsec');
  return unique([slug, ...words, ...extras, ...(FAMILY_TO_CAREER_AREAS[slug] || []).flatMap(expandSlug)]);
}

function expandSlug(value) {
  if (!value) return [];
  const slug = String(value).toLowerCase().replace(/\s+/g, '_');
  return unique([slug, ...tokenize(slug.replace(/_/g, ' '))]);
}

function expandSkill(value) {
  if (!value) return [];
  const raw = String(value).toLowerCase();
  const slug = normalizeSkill(raw);
  const parts = tokenize(raw.replace(/[-_]/g, ' '));
  const extras = [];
  if (slug === 'javascript' || slug === 'js') extras.push('javascript', 'js');
  if (slug === 'typescript' || slug === 'ts') extras.push('typescript', 'ts');
  if (slug === 'golang' || slug === 'go') extras.push('go', 'golang');
  if (slug === 'kubernetes' || slug === 'k8s') extras.push('kubernetes', 'k8s');
  if (slug === 'cpp' || slug === 'c++') extras.push('cpp', 'c++');
  if (slug.includes('machine') || slug === 'ml') extras.push('ml', 'machine', 'learning');
  return unique([slug, ...parts, ...extras].filter(Boolean));
}

function tokenize(text) {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'you', 'our', 'are', 'this', 'that', 'from', 'your',
    'will', 'have', 'has', 'been', 'into', 'about', 'than', 'then', 'them', 'they',
    'who', 'what', 'when', 'where', 'which', 'while', 'able', 'such', 'also', 'more',
    'most', 'other', 'some', 'any', 'all', 'can', 'may', 'must', 'should', 'etc',
  ]);
  const out = [];
  for (const raw of String(text || '').toLowerCase().split(/[^a-z0-9+#]+/)) {
    if (raw.length < 2 || stop.has(raw)) continue;
    out.push(raw);
  }
  return out;
}

function normalizeSkill(value) {
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9+.#-]/g, '');
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}
