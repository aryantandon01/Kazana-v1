/**
 * Modular matching engine — explainable recommendations.
 * See docs/matching.md and product Matches page philosophy.
 */

import {
  DEFAULT_MIN_SCORE,
  DEFAULT_WEIGHTS,
  EXPERIENCE_GATING_MULTIPLIER,
  EXPERIENCE_GATING_THRESHOLD,
  EXPERIENCE_RANK,
  LEVEL_TO_EXPERIENCE,
  RANKING_BOOSTS,
} from './weights.js';
import {
  scoreCareerAreas,
  scoreExperience,
  scoreJobFamily,
  scoreLocation,
  scoreSemantic,
  scoreSkills,
} from './signals.js';
import { getJobFreshnessDisplay } from '../jobs/freshness.js';
import { studentExperienceGate } from './studentEligibility.js';
import { roleFamilyCompatibility, seniorityEligibility, ROLE_COMPATIBILITY, SENIORITY } from './eligibility.js';

export { DEFAULT_MIN_SCORE };

const SIGNAL_FNS = {
  skills: (job, resume, profile) => scoreSkills(job, resume),
  career_areas: (job, resume, profile) => scoreCareerAreas(job, resume, profile),
  experience: (job, resume) => scoreExperience(job, resume),
  semantic: (job, resume) => scoreSemantic(job, resume),
  location: (job, resume, profile) => scoreLocation(job, resume, profile),
  job_family: (job, resume) => scoreJobFamily(job, resume),
};

/**
 * Full explainable score for one resume × job.
 * @param {object} job - optionally shaped with career_areas, tags, work_arrangements
 * @param {object} resume
 * @param {object|null} profile
 * @param {{ weights?: object }} [options]
 */
export function scoreJobForResume(job, resume, profile, options = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };
  const gate = studentExperienceGate(job, profile);
  if (gate.blocked) {
    return zeroedMatchResult(weights, gate);
  }
  const eligibility = evaluateEligibility(job, resume);
  if (!eligibility.eligible) {
    return ineligibleMatchResult(weights, eligibility);
  }

  const breakdown = {};
  let weighted = 0;
  let weightSum = 0;
  const evidenceGaps = [];

  for (const [key, weight] of Object.entries(weights)) {
    const fn = SIGNAL_FNS[key];
    if (!fn || weight <= 0) continue;
    const result = fn(job, resume, profile);
    breakdown[key] = {
      score: round3(result.score),
      weight,
      contribution: round3(result.score * weight),
      evidence: result.evidence || {},
    };
    weighted += result.score * weight;
    weightSum += weight;
    if (result.evidence?.note === 'missing_experience' || result.evidence?.note === 'limited_resume_skills') {
      evidenceGaps.push(result.evidence.note);
    }
  }

  const rawScore = weightSum > 0 ? Math.min(1, weighted / weightSum) : 0;

  // Experience gating: when the experience signal is weak (severe level or
  // YOE mismatch), damp the overall score so unrelated overlaps can't float
  // clearly-mismatched roles back over the threshold.
  const expGate =
    (breakdown.experience?.score ?? 0) < EXPERIENCE_GATING_THRESHOLD
      ? EXPERIENCE_GATING_MULTIPLIER
      : 1;

  const mismatch = roleFamilyMismatch(job, resume);
  const score = mismatch
    ? Math.min(rawScore * expGate, mismatch.cap) * mismatch.multiplier
    : rawScore * expGate;
  const strengths = buildStrengths(breakdown);
  const missingSkills = breakdown.skills?.evidence?.missing || [];
  const matchedSkills = breakdown.skills?.evidence?.matched || [];
  const reasons = strengths.map((s) => s.id);
  const confidence = computeConfidence(breakdown, resume, evidenceGaps);
  const tier = matchTier(score);
  const freshness = getJobFreshnessDisplay(job);
  const priority = computePriority(score, freshness, breakdown);

  return {
    score: round3(score),
    reasons,
    breakdown,
    strengths,
    missing_skills: missingSkills.map(formatSkillLabel),
    matched_skills: matchedSkills.map(formatSkillLabel),
    recommendation_reasons: buildRecommendationReasons(breakdown, job, profile, freshness),
    confidence,
    tier,
    priority: round3(priority),
    label: tier.label,
    excluded: false,
  };
}

function evaluateEligibility(job, resume) {
  const role_compatibility = roleFamilyCompatibility(resume?.job_family, job?.job_family || job?.jobFamily);
  const seniority = seniorityEligibility(
    levelBandOfResume(resume), bandOfJob(job),
    yearsOf(resume), yearsReq(job)
  );
  const ineligible =
    role_compatibility === ROLE_COMPATIBILITY.INCOMPATIBLE ||
    seniority === SENIORITY.INELIGIBLE;
  return {
    eligible: !ineligible,
    role_compatibility,
    seniority,
    jobTitle: job?.title || '',
  };
}

function yearsOf(r) {
  const y = r?.years_of_experience ?? r?.years;
  return y != null ? Number(y) : null;
}
function yearsReq(j) {
  if (j?.years_required_min != null) return Number(j.years_required_min);
  if (j?.years_required != null) return Number(j.years_required);
  return null;
}
function levelBandOfResume(r) {
  const fromLevel = LEVEL_TO_EXPERIENCE[String(r?.level || '').toUpperCase()];
  if (fromLevel) return fromLevel;
  const y = yearsOf(r);
  if (y == null) return null;
  const n = Number(y);
  if (n <= 0) return 'intern';
  if (n <= 1) return 'new_grad';
  if (n <= 3) return 'entry';
  if (n <= 6) return 'mid';
  if (n <= 9) return 'senior';
  if (n <= 13) return 'staff';
  if (n <= 18) return 'principal';
  return 'director';
}
function bandOfJob(j) {
  const bands = [inferJobBand(j?.title), extractJobFacetBand(j)];
  const present = bands.filter(Boolean);
  if (!present.length) return null;
  return present.reduce((a, b) => (rankOf(b) > rankOf(a) ? b : a));
}
function inferJobBand(title) {
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
function extractJobFacetBand(j) {
  const facet = (j?.experience_levels || [])[0];
  return facet ? facet.value || facet : null;
}
function rankOf(b) {
  return EXPERIENCE_RANK[b] ?? 0;
}

function ineligibleMatchResult(weights, { role_compatibility = '?', seniority = '?', jobTitle = '' } = {}) {
  const breakdown = {};
  for (const [key, weight] of Object.entries(weights)) {
    if (weight <= 0) continue;
    breakdown[key] = { score: 0, weight, contribution: 0, evidence: { note: `ineligible:${role_compatibility}:${seniority}` } };
  }
  return {
    score: 0, reasons: [], breakdown, strengths: [], missing_skills: [], matched_skills: [], recommendation_reasons: [],
    confidence: { level: 'high', score: 1, label: 'High Confidence' }, tier: matchTier(0), priority: 0,
    label: 'Not recommended', excluded: true,
    exclude_reason: `role_compatibility=${role_compatibility}; seniority=${seniority}; job=${jobTitle || ''}`,
    eligibility: { eligible: false, role_compatibility, seniority },
  };
}

function zeroedMatchResult(weights, gate) {
  const breakdown = {};
  for (const [key, weight] of Object.entries(weights)) {
    if (weight <= 0) continue;
    breakdown[key] = {
      score: 0,
      weight,
      contribution: 0,
      evidence: {
        note: gate.reason,
        seniority: gate.seniority ?? null,
        is_student: gate.is_student,
      },
    };
  }
  return {
    score: 0,
    reasons: [],
    breakdown,
    strengths: [],
    missing_skills: [],
    matched_skills: [],
    recommendation_reasons: [],
    confidence: { level: 'high', score: 1, label: 'High Confidence' },
    tier: matchTier(0),
    priority: 0,
    label: 'Excluded',
    excluded: true,
    exclude_reason: gate.reason,
  };
}

/** Eng resume vs clearly non-eng title — hard-cap so YOE/location can't float it to "Great". */
function roleFamilyMismatch(job, resume) {
  const family = String(resume?.job_family || '');
  const engResume = /engineer|developer|software|machine_learning|ai_|data_engineer|devops|security_engineer|quantitative|hardware/.test(
    family,
  );
  if (!engResume) return null;

  const title = String(job?.title || '');
  if (
    /\b(administrative|administrator|executive assistant|office manager|receptionist|personal assistant)\b/i.test(
      title,
    )
  ) {
    return { reason: 'eng_vs_admin_title', multiplier: 0.35, cap: 0.42 };
  }
  if (/\b(recruiter|talent acquisition|account executive|sales associate)\b/i.test(title)) {
    return { reason: 'eng_vs_non_eng_title', multiplier: 0.45, cap: 0.48 };
  }
  // IC resume vs explicit management track (engineering manager, director, head of, VP) —
  // hard-cap so location/skills can't float a leadership role to an IC top-match.
  if (/\b(engineering manager|engineering director|head of engineering|vp of engineering|engineering manager|director of engineering)\b/i.test(title)) {
    return { reason: 'ic_vs_management_title', multiplier: 0.5, cap: 0.4 };
  }

  // Generic cross-domain fallback: if the resume family and job family are in
  // fundamentally different clusters (proximity ≤ 0.5 — e.g. software_engineer
  // vs product_manager), hard-cap so location/skills can't float an unrelated role.
  const familyProximity = scoreJobFamily(job, resume)?.score ?? 1;
  if (familyProximity <= 0.5) {
    return { reason: 'cross_domain_title', multiplier: 0.6, cap: 0.45 };
  }
  return null;
}

/**
 * Best score across a user's resumes (keeps Jobs MatchIndicator compatible).
 */
export function scoreJobForUser(job, resumes, profile, options = {}) {
  if (!resumes?.length) {
    return {
      score: 0,
      reasons: [],
      breakdown: {},
      strengths: [],
      missing_skills: [],
      matched_skills: [],
      recommendation_reasons: [],
      confidence: { level: 'low', score: 0.2 },
      tier: matchTier(0),
      priority: 0,
      label: 'No match',
      excluded: false,
    };
  }

  let best = null;
  for (const resume of resumes) {
    const result = scoreJobForResume(job, resume, profile, options);
    if (!best || result.score > best.score || (result.score === best.score && result.priority > best.priority)) {
      best = { ...result, resume_id: resume.id };
    }
  }
  return best;
}

export function matchTier(score) {
  if (score >= 0.88) return { id: 'excellent', label: 'Excellent Match', min: 0.88 };
  if (score >= 0.78) return { id: 'great', label: 'Great Match', min: 0.78 };
  if (score >= 0.65) return { id: 'good', label: 'Good Match', min: 0.65 };
  if (score >= 0.55) return { id: 'fair', label: 'Fair Match', min: 0.55 };
  return { id: 'low', label: 'Low Match', min: 0 };
}

function computeConfidence(breakdown, resume, gaps) {
  let score = 0.55;
  if (resume?.job_family) score += 0.1;
  if (resume?.level) score += 0.08;
  if ((resume.years_of_experience ?? resume.years) != null) score += 0.08;
  if ((resume.companies || []).length) score += 0.06;
  if (breakdown.skills?.evidence?.matched?.length) score += 0.1;
  if (gaps.includes('limited_resume_skills')) score -= 0.12;
  if (gaps.includes('missing_experience')) score -= 0.08;
  score = Math.min(0.98, Math.max(0.2, score));

  const level = score >= 0.75 ? 'high' : score >= 0.5 ? 'medium' : 'low';
  return {
    level,
    score: round3(score),
    label: level === 'high' ? 'High Confidence' : level === 'medium' ? 'Medium Confidence' : 'Low Confidence',
  };
}

function computePriority(score, freshness, breakdown) {
  let priority = score;
  if (freshness.badge?.kind === 'new') priority += RANKING_BOOSTS.freshness_new;
  else if (freshness.badge?.kind === 'updated' || freshness.badge?.kind === 'recent') {
    priority += RANKING_BOOSTS.freshness_updated;
  }
  if ((breakdown.location?.score || 0) >= 0.8) priority += 0.04;
  return Math.min(1.25, priority);
}

function buildStrengths(breakdown) {
  const strengths = [];

  for (const skill of (breakdown.skills?.evidence?.matched || []).slice(0, 5)) {
    strengths.push({ id: `skill:${skill}`, label: formatSkillLabel(skill), kind: 'skill' });
  }

  for (const area of (breakdown.career_areas?.evidence?.matched || []).slice(0, 3)) {
    strengths.push({
      id: `area:${area}`,
      label: formatAreaLabel(area),
      kind: 'career_area',
    });
  }

  if ((breakdown.experience?.score || 0) >= 0.75) {
    strengths.push({ id: 'experience', label: 'Experience fit', kind: 'experience' });
  }
  if ((breakdown.location?.score || 0) >= 0.75) {
    const match = breakdown.location?.evidence?.match;
    const label =
      match === 'same_city'
        ? 'Same city'
        : match === 'same_country'
          ? 'Same country'
          : 'Location fit';
    strengths.push({ id: 'location', label, kind: 'location' });
  }
  if ((breakdown.semantic?.score || 0) >= 0.55) {
    strengths.push({ id: 'semantic', label: 'Resume similarity', kind: 'semantic' });
  }

  return strengths.slice(0, 8);
}

function buildRecommendationReasons(breakdown, job, profile, freshness) {
  const reasons = [];

  if ((breakdown.career_areas?.evidence?.matched || []).length) {
    reasons.push(`Matches your ${breakdown.career_areas.evidence.matched.map(formatAreaLabel).join(', ')} focus`);
  }
  if ((breakdown.skills?.evidence?.matched || []).length >= 2) {
    reasons.push('Strong skill overlap with your profile');
  }
  const locMatch = breakdown.location?.evidence?.match;
  if (locMatch === 'same_city') {
    reasons.push('Same city as your profile');
  } else if (locMatch === 'same_country') {
    reasons.push('Located in your country');
  } else if ((breakdown.location?.score || 0) >= 0.85) {
    reasons.push(
      profile?.remote_only ? 'Matches your remote preference' : 'Matches your preferred location',
    );
  }
  if (freshness.badge?.kind === 'new') {
    reasons.push('Newly discovered — worth applying early');
  } else if (freshness.badge?.kind === 'updated') {
    reasons.push('Recently updated listing');
  }
  if ((breakdown.semantic?.score || 0) >= 0.6) {
    reasons.push('Similar to your resume profile');
  }

  return reasons.slice(0, 5);
}

/**
 * One concise AI insight for the Matches header.
 */
export function buildCareerInsight(matches, resumes) {
  if (!resumes?.length) {
    return {
      headline: 'Upload a resume to unlock personalized recommendations.',
      detail: 'Kazana needs your background to score fit, surface missing skills, and prioritize what to apply to today.',
      action: { label: 'Add resume', href: '/add-resume' },
    };
  }

  if (!matches?.length) {
    return {
      headline: 'No strong matches yet — a few adjustments can change that.',
      detail: 'Expand preferred locations, lower your minimum match score, or explore Discover for successful resume patterns.',
      action: { label: 'Update preferences', href: '/settings' },
    };
  }

  const strong = matches.filter((m) => (m.explanation?.score ?? m.score) >= 0.78);
  const missingCounts = new Map();
  for (const m of matches) {
    for (const skill of m.explanation?.missing_skills || []) {
      missingCounts.set(skill, (missingCounts.get(skill) || 0) + 1);
    }
  }
  const topMissing = [...missingCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  const areas = new Map();
  for (const m of matches) {
    for (const a of m.jobs?.career_areas || []) {
      const label = a.label || a.value || a;
      areas.set(label, (areas.get(label) || 0) + 1);
    }
  }
  const topArea = [...areas.entries()].sort((a, b) => b[1] - a[1])[0];

  const avg =
    matches.reduce((sum, m) => sum + (m.explanation?.score ?? m.score ?? 0), 0) / matches.length;

  if (topMissing && topMissing[1] >= 2) {
    return {
      headline: topArea
        ? `You strongly align with ${Math.round((strong.length / matches.length) * 100) || Math.round(avg * 100)}% of ${topArea[0]} opportunities.`
        : `Your average match across recommendations is ${Math.round(avg * 100)}%.`,
      detail: `Most common gap: ${topMissing[0]}. Learning it would improve compatibility with many similar roles.`,
      action: { label: 'Browse related jobs', href: '/jobs' },
    };
  }

  return {
    headline: `We found ${matches.length} opportunities that fit your profile.`,
    detail: strong.length
      ? `${strong.length} are strong matches — prioritize those first.`
      : `Average match score is ${Math.round(avg * 100)}%. Review explanations to decide where to apply.`,
    action: { label: 'Continue browsing', href: '/jobs' },
  };
}

export function buildMatchesSummary(matches) {
  const scores = matches.map((m) => m.explanation?.score ?? m.score ?? 0);
  const strong = matches.filter((m) => (m.explanation?.score ?? m.score) >= 0.78);
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const newToday = matches.filter((m) => {
    const created = new Date(m.created_at || m.jobs?.discovered_at || 0).getTime();
    return created >= dayAgo;
  });
  const updated = matches.filter((m) => {
    const fresh = getJobFreshnessDisplay(m.jobs || {});
    return fresh.badge?.kind === 'updated' || fresh.badge?.kind === 'recent';
  });
  const followed = matches.filter((m) => m.explanation?.breakdown?.company?.evidence?.matched);

  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  return {
    strong_matches: strong.length,
    new_today: newToday.length,
    average_match: Math.round(avg * 100),
    companies_you_follow: followed.length,
    recently_updated: updated.length,
    total: matches.length,
  };
}

function formatAreaLabel(area) {
  const map = {
    ai: 'AI',
    machine_learning: 'Machine Learning',
    full_stack: 'Full Stack',
    devops: 'DevOps',
    it: 'IT',
    hr: 'HR',
  };
  if (map[area]) return map[area];
  return String(area)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSkillLabel(skill) {
  const map = {
    llms: 'LLMs',
    aws: 'AWS',
    gcp: 'GCP',
    sql: 'SQL',
    cicd: 'CI/CD',
    pytorch: 'PyTorch',
    tensorflow: 'TensorFlow',
    'distributed-systems': 'Distributed Systems',
    'vector-databases': 'Vector Databases',
    'project-management': 'Project Management',
  };
  if (map[skill]) return map[skill];
  return String(skill)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}
