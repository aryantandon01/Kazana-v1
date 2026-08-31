/**
 * Eligibility-first matching — determine whether a role is pursuable BEFORE
 * computing match quality. INCOMPATIBLE/INELIGIBLE jobs are excluded from
 * Best Match (but remain searchable/filterable in the jobs UI).
 */

import { FAMILY_CLUSTERS, EXPERIENCE_RANK, IC_CATEGORIES, LEVEL_TO_EXPERIENCE } from './weights.js';
import { studentExperienceGate } from './studentEligibility.js';

export const ROLE_COMPATIBILITY = {
  DIRECT: 'direct',
  RELATED: 'related',
  ADJACENT: 'adjacent',
  WEAK: 'weak',
  INCOMPATIBLE: 'incompatible',
};

export const SENIORITY = {
  ELIGIBLE: 'eligible',
  STRETCH: 'stretch',
  INELIGIBLE: 'ineligible',
};

/**
 * Generalized role-family compatibility (58-family taxonomy, cluster-derived).
 *
 * DIRECT  → same cluster, same role type
 * RELATED → same cluster mixed (IC↔mgmt) OR adjacent clusters (tech↔AI, tech↔data…)
 * ADJACENT→ same role type across nearby clusters
 * WEAK    → IC ↔ management, or weak cross-domain
 * INCOMPATIBLE → unrelated role types (e.g. eng vs PM, eng vs legal, eng vs recruiting)
 */
export function roleFamilyCompatibility(candidateFamily, jobFamily) {
  const cf = String(candidateFamily || '').toLowerCase();
  const jf = String(jobFamily || '').toLowerCase();
  if (!cf || !jf) return ROLE_COMPATIBILITY.WEAK;

  if (cf === jf) return ROLE_COMPATIBILITY.DIRECT;

  const cCluster = FAMILY_CLUSTERS[cf];
  const jCluster = FAMILY_CLUSTERS[jf];
  if (!cCluster || !jCluster) return ROLE_COMPATIBILITY.WEAK;

  const candidateIsIC = IC_CATEGORIES.has(cCluster);
  const jobIsIC = IC_CATEGORIES.has(jCluster);

  // Engineering IC resume vs management of non-eng domains + IC/mgmt cross.
  const engClusters = new Set(['technology', 'ai_research', 'data_analytics', 'quantitative', 'hardware']);
  if (engClusters.has(cCluster) && !jobIsIC && jCluster !== 'engineering_management') {
    return ROLE_COMPATIBILITY.INCOMPATIBLE;
  }
  if (engClusters.has(cCluster) && jCluster === 'engineering_management') {
    return ROLE_COMPATIBILITY.WEAK;
  }
  if (cCluster === 'engineering_management' && engClusters.has(jCluster)) {
    return ROLE_COMPATIBILITY.WEAK;
  }

  if (cCluster === jCluster) {
    return candidateIsIC === jobIsIC ? ROLE_COMPATIBILITY.DIRECT : ROLE_COMPATIBILITY.RELATED;
  }
  return ROLE_COMPATIBILITY.INCOMPATIBLE;
}

/**
 * Seniority gating. resumeBand/jobBand are 'intern'..'director' (or null).
 */
export function seniorityEligibility(resumeBand, jobBand, userYears, requiredYears) {
  if (!resumeBand || !jobBand) {
    // Unknown band: allow but flag low confidence (STRETCH unless YOE is decisive)
    if (requiredYears != null && userYears != null && userYears + 2 < requiredYears) {
      return SENIORITY.INELIGIBLE;
    }
    return SENIORITY.STRETCH;
  }
  const rank = (b) => EXPERIENCE_RANK[b] ?? 0;
  const delta = rank(resumeBand) - rank(jobBand); // resume − job

  if (delta <= -3) return SENIORITY.INELIGIBLE; // junior → staff/principal/director
  if (delta === -2) {
    // junior → senior: with sufficient YOE it's a stretch, else ineligible
    if (userYears != null && requiredYears != null && userYears + 1 >= requiredYears) {
      return SENIORITY.STRETCH;
    }
    return SENIORITY.INELIGIBLE;
  }
  if (delta === -1) return SENIORITY.STRETCH;
  return SENIORITY.ELIGIBLE;
}

/** Dynamic weight normalization — missing signals are excluded, not assumed "match". */
export function normalizeKnownWeights(weights, known) {
  const total = Object.entries(weights)
    .filter(([k]) => known.has(k))
    .reduce((s, [, w]) => s + w, 0);
  return total > 0 ? total : 1;
}

/**
 * Side-effect-free eligibility check for stored Best-Match candidates.
 * Lets the Jobs page drop persisted rows the current engine would exclude,
 * so stale matches can't float between reprocess runs.
 */
export function isEligibleForJob(job, resume, profile) {
  const gate = studentExperienceGate(job, profile);
  if (gate.blocked) return { eligible: false, reason: gate.reason };

  const roleCompat = roleFamilyCompatibility(resume?.job_family, job?.job_family || job?.jobFamily);
  if (roleCompat === ROLE_COMPATIBILITY.INCOMPATIBLE) {
    return { eligible: false, reason: `role_compatibility=${roleCompat}` };
  }

  const seniority = seniorityEligibility(
    candidateBand(resume), jobBand(job),
    resumeYears(resume), jobYearsRequired(job)
  );
  if (seniority === SENIORITY.INELIGIBLE) {
    return { eligible: false, reason: `seniority=${seniority}` };
  }

  return { eligible: true, role_compatibility: roleCompat, seniority };
}

function candidateBand(r) {
  const fromLevel = LEVEL_TO_EXPERIENCE[String(r?.level || '').toUpperCase()];
  if (fromLevel) return fromLevel;
  const y = resumeYears(r);
  if (y == null) return null;
  if (y <= 0) return 'intern';
  if (y <= 1) return 'new_grad';
  if (y <= 3) return 'entry';
  if (y <= 6) return 'mid';
  if (y <= 9) return 'senior';
  if (y <= 13) return 'staff';
  if (y <= 18) return 'principal';
  return 'director';
}

function jobBand(j) {
  const fromTitle = titleBand(j?.title);
  const facet = (j?.experience_levels || [])[0];
  const fromFacet = facet ? facet.value || facet : null;
  const bands = [fromTitle, fromFacet].filter(Boolean);
  if (!bands.length) return null;
  return bands.reduce((a, b) => ((EXPERIENCE_RANK[b] ?? 0) > (EXPERIENCE_RANK[a] ?? 0) ? b : a));
}

function titleBand(title) {
  const t = String(title || '');
  if (/\b(director|head of|vice president|\bvp\b)\b/i.test(t)) return 'director';
  if (/\b(principal|distinguished)\b/i.test(t)) return 'principal';
  if (/\bstaff\b/i.test(t)) return 'staff';
  if (/\b(senior|sr\.?)\b/i.test(t)) return 'senior';
  if (/\b(engineering manager|eng manager)\b/i.test(t)) return 'senior';
  if (/\b(mid|intermediate)\b/i.test(t)) return 'mid';
  if (/\b(junior|entry|early career)\b/i.test(t)) return 'entry';
  if (/\b(new grad|university grad|recent graduate)\b/i.test(t)) return 'new_grad';
  if (/\bintern\b/i.test(t)) return 'intern';
  return null;
}

function resumeYears(r) {
  const y = r?.years_of_experience ?? r?.years;
  return y != null ? Number(y) : null;
}

function jobYearsRequired(j) {
  if (j?.years_required_min != null) return Number(j.years_required_min);
  if (j?.years_required != null) return Number(j.years_required);
  return null;
}