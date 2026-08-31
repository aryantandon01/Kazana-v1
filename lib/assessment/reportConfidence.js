import { createHash } from 'crypto';

/**
 * Interview report confidence — probabilistic, never "verified".
 *
 * v2: Confidence weights are read from the `confidence_rules` table
 * (configurable, addable without code changes). Falls back to the
 * hardcoded defaults below when the table is absent or empty.
 *
 * Signals:
 *   - Email evidence provided (hashed invitation/rejection)          +0.15
 *   - Corroborating reports (same company + role + stage)            +0.10 each (cap +0.25)
 *   - Contributor reputation (5+ prior published reports)            +0.05
 *   - Timeline consistency (submitted within 14 days of interview)   +0.05
 *   - Detailed report (>= 3 questions and report text >= 500 chars)  +0.05
 *
 * Cap at 0.95. A single bare report = 0.40.
 */

const FALLBACK_RULES = {
  base_confidence: 0.4,
  email_evidence: 0.15,
  corroboration_per_report: 0.1,
  corroboration_cap: 0.25,
  contributor_reputation: 0.05,
  timeline_consistency: 0.05,
  detail_bonus: 0.05,
  max_confidence: 0.95,
};

const LEVEL_THRESHOLDS = { high: 0.75, medium: 0.55 };

/**
 * Load confidence rule weights from DB (if available), else fallback constants.
 * @param {object} supabase - optional Supabase client (SSR/admin)
 * @returns {Promise<Record<string, number>>}
 */
export async function loadConfidenceRules(supabase) {
  if (!supabase) return { ...FALLBACK_RULES };

  try {
    const { data, error } = await supabase
      .from('confidence_rules')
      .select('slug, weight')
      .eq('enabled', true);

    if (error || !data?.length) return { ...FALLBACK_RULES };

    const rules = { ...FALLBACK_RULES };
    for (const row of data) {
      if (row.weight != null) rules[row.slug] = Number(row.weight);
    }
    return rules;
  } catch {
    return { ...FALLBACK_RULES };
  }
}

/**
 * @param {{
 *   supabase?: object|null,
 *   hasEmailEvidence: boolean,
 *   corroboratingCount: number,
 *   contributorReportCount: number,
 *   interviewDate?: string|null,
 *   submittedAt?: string,
 *   questionsLength: number,
 *   reportTextLength: number,
 * }} input
 * @returns {Promise<{
 *   score: number,
 *   level: 'low'|'medium'|'high',
 *   label: string,
 *   signals: string[],
 * }>}
 */
export async function computeReportConfidence({
  supabase = null,
  hasEmailEvidence = false,
  corroboratingCount = 0,
  contributorReportCount = 0,
  interviewDate = null,
  submittedAt = new Date().toISOString(),
  questionsLength = 0,
  reportTextLength = 0,
}) {
  const rules = await loadConfidenceRules(supabase);
  const maxConfidence = rules.max_confidence ?? 0.95;

  let score = rules.base_confidence ?? 0.4;
  const signals = [];

  if (hasEmailEvidence) {
    score += rules.email_evidence ?? 0.15;
    signals.push('email_evidence');
  }

  if (corroboratingCount > 0) {
    const bonus = Math.min(
      corroboratingCount * (rules.corroboration_per_report ?? 0.1),
      rules.corroboration_cap ?? 0.25,
    );
    score += bonus;
    signals.push('corroborating_reports');
  }

  if (contributorReportCount >= 5) {
    score += rules.contributor_reputation ?? 0.05;
    signals.push('contributor_reputation');
  }

  if (isTimelineConsistent(interviewDate, submittedAt)) {
    score += rules.timeline_consistency ?? 0.05;
    signals.push('timeline_consistency');
  }

  if (questionsLength >= 3 && reportTextLength >= 500) {
    score += rules.detail_bonus ?? 0.05;
    signals.push('detailed_report');
  }

  score = clamp(Math.round(score * 100) / 100, 0, maxConfidence);

  const level = score >= (LEVEL_THRESHOLDS.high ?? 0.75) ? 'high' : score >= (LEVEL_THRESHOLDS.medium ?? 0.55) ? 'medium' : 'low';
  const label = level === 'high' ? 'High confidence' : level === 'medium' ? 'Medium confidence' : 'Low confidence';

  return { score, level, label, signals };
}

function isTimelineConsistent(interviewDate, submittedAt) {
  if (!interviewDate) return false;
  const interview = new Date(interviewDate);
  const submitted = new Date(submittedAt);
  if (Number.isNaN(interview.getTime()) || Number.isNaN(submitted.getTime())) return false;
  const days = (submitted.getTime() - interview.getTime()) / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= 14;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Hash an email address deterministically (never store raw proof). */
export function hashEmailEvidence(emailOrToken) {
  if (!emailOrToken) return null;
  return createHash('sha256').update(String(emailOrToken).trim().toLowerCase()).digest('hex');
}