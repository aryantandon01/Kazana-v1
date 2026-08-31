/**
 * Student vs experience-level eligibility for Matches.
 *
 * Non-students: internship roles are blocked (score 0, hidden).
 * Students: only intern / new_grad / entry may match; mid+ is blocked.
 *
 * Uses structured fields only (facets, years_required_min, title heuristics).
 * Does not parse job descriptions.
 */

const STUDENT_OK = new Set(['intern', 'new_grad', 'entry']);
const ABOVE_ENTRY = new Set(['mid', 'senior', 'staff', 'principal', 'director']);

/**
 * Coarse seniority for gating (not the same as experience fit scoring).
 * @returns {'intern'|'new_grad'|'entry'|'mid'|'senior'|'staff'|'principal'|'director'|null}
 */
export function resolveJobSeniorityForGate(job) {
  const title = String(job?.title || '');

  const employment = (job.employment_types || []).map((e) => e.value || e);
  if (employment.includes('internship')) return 'intern';

  const facet = (job.experience_levels || [])[0];
  const facetVal = facet?.value || facet || null;
  if (facetVal === 'intern') return 'intern';
  if (facetVal === 'new_grad') return 'new_grad';
  if (facetVal === 'entry') return 'entry';
  if (ABOVE_ENTRY.has(facetVal)) return facetVal;

  if (/\bintern(ship)?\b/i.test(title)) return 'intern';
  if (/\b(new grad|university grad|recent graduate)\b/i.test(title)) return 'new_grad';
  if (/\b(junior|entry[- ]level|early career)\b/i.test(title)) return 'entry';

  if (/\b(director|head of|vice president|\bvp\b)\b/i.test(title)) return 'director';
  if (/\b(principal|distinguished)\b/i.test(title)) return 'principal';
  if (/\bstaff\b/i.test(title)) return 'staff';
  if (/\b(senior|sr\.?)\b/i.test(title)) return 'senior';
  if (/\b(engineering manager|eng(?:ineering)? manager)\b/i.test(title)) return 'senior';
  if (/\b(mid[- ]level|intermediate)\b/i.test(title)) return 'mid';

  const years = structuredYearsMin(job);
  if (years === 0) return 'intern';
  if (years != null && years <= 2) return 'entry';
  if (years != null && years >= 3) return 'mid';

  return null;
}

function structuredYearsMin(job) {
  if (job?.years_required_min != null && !Number.isNaN(Number(job.years_required_min))) {
    return Number(job.years_required_min);
  }
  if (job?.years_required != null && !Number.isNaN(Number(job.years_required))) {
    return Number(job.years_required);
  }
  return null;
}

/**
 * @returns {{ blocked: boolean, reason?: string, seniority?: string|null, is_student: boolean }}
 */
export function studentExperienceGate(job, profile) {
  const isStudent = Boolean(profile?.is_student);
  const seniority = resolveJobSeniorityForGate(job);

  if (!isStudent) {
    if (seniority === 'intern') {
      return { blocked: true, reason: 'non_student_intern', seniority, is_student: false };
    }
    return { blocked: false, seniority, is_student: false };
  }

  if (seniority == null || STUDENT_OK.has(seniority)) {
    return { blocked: false, seniority, is_student: true };
  }

  return { blocked: true, reason: 'student_above_entry', seniority, is_student: true };
}
