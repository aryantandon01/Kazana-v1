/**
 * Report presentation — the shared vocabulary for how an interview experience
 * renders, so the browse card and the detail page never drift apart.
 *
 * Mirrors lib/jobs/freshness.js: pure data + helpers, no React.
 */

export const OUTCOME_LABELS = {
  offer: 'Offer received',
  advance: 'Advanced to next round',
  reject: 'Rejected',
  no_response: 'No response yet',
};

/**
 * Confidence presentation — the report's signature element, mirroring JobCard's
 * freshness block. The tint carries meaning: green = high, amber = medium,
 * neutral = low. Colour is never the only signal — the label always names it.
 */
export const CONFIDENCE_TONES = {
  high: {
    label: 'High confidence',
    background: 'var(--color-success-muted)',
    color: 'var(--color-success)',
  },
  medium: {
    label: 'Medium confidence',
    background: 'var(--color-warning-muted)',
    color: 'var(--color-warning)',
  },
  low: {
    label: 'Low confidence',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-secondary)',
  },
};

/** Human-readable labels for the confidence signals the backend computes. */
export const SIGNAL_LABELS = {
  email_evidence: 'email evidence',
  corroborating_reports: 'corroborating reports',
  contributor_reputation: 'contributor reputation',
  timeline_consistency: 'timeline consistency',
  detailed_report: 'level of detail',
};

/**
 * @param {{ level?: string|null }|null|undefined} confidence
 * @returns {{ label: string, background: string, color: string }}
 */
export function getConfidenceTone(confidence) {
  return CONFIDENCE_TONES[confidence?.level] || CONFIDENCE_TONES.low;
}

export function formatSignal(signal) {
  return SIGNAL_LABELS[signal] || String(signal).replace(/_/g, ' ');
}

export function formatReportDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

/**
 * Grouped metadata for a report — mirrors buildJobMetaItems so the card and the
 * detail page present the same fields the same way. The date rides with the
 * confidence signature block, so it is deliberately not repeated here.
 *
 * @param {object} report
 * @returns {Array<{ label: string, value: string }>}
 */
export function buildReportMetaItems(report = {}) {
  return [
    report.level ? { label: 'Level', value: report.level } : null,
    report.country ? { label: 'Country', value: report.country } : null,
    report.difficulty != null ? { label: 'Difficulty', value: `${report.difficulty}/5` } : null,
    report.outcome ? { label: 'Outcome', value: OUTCOME_LABELS[report.outcome] || report.outcome } : null,
  ].filter(Boolean);
}
