import { describe, it, expect } from 'vitest';
import { computeReportConfidence } from '@/lib/assessment/reportConfidence';

/**
 * These exercise the fallback rule weights (no DB client supplied), which the
 * module uses when `confidence_rules` is unavailable. Values therefore match
 * the documented defaults: base 0.40, email 0.15, corroboration 0.10 (cap
 * 0.25), reputation 0.05, timeline 0.05, detail 0.05, cap 0.95.
 */
const opts = (overrides = {}) => ({ supabase: null, ...overrides });

const SUBMITTED_AT = '2026-01-15T00:00:00.000Z';
const RECENT_INTERVIEW = '2026-01-10T00:00:00.000Z'; // 5 days before → consistent
const OLD_INTERVIEW = '2025-11-01T00:00:00.000Z'; // >14 days → not consistent

describe('confidence — evidence signal', () => {
  it('awards no evidence bonus when nothing was supplied', async () => {
    const c = await computeReportConfidence(opts({ evidenceStatus: 'none' }));
    expect(c.score).toBe(0.4);
    expect(c.signals).not.toContain('email_evidence');
    expect(c.evidence_status).toBe('none');
  });

  it('awards no evidence bonus for invalid evidence', async () => {
    const c = await computeReportConfidence(opts({ evidenceStatus: 'invalid' }));
    expect(c.score).toBe(0.4);
    expect(c.signals).not.toContain('email_evidence');
    expect(c.evidence_status).toBe('invalid');
    expect(c.evidence_kind).toBeNull();
  });

  it('awards the bonus for plausible evidence', async () => {
    const c = await computeReportConfidence(
      opts({ evidenceStatus: 'plausible', evidenceKind: 'email' }),
    );
    expect(c.score).toBe(0.55);
    expect(c.signals).toContain('email_evidence');
    expect(c.evidence_status).toBe('plausible');
    expect(c.evidence_kind).toBe('email');
  });

  it('keeps backwards compatibility with the legacy hasEmailEvidence boolean', async () => {
    const legacyTrue = await computeReportConfidence(opts({ hasEmailEvidence: true }));
    expect(legacyTrue.score).toBe(0.55);
    expect(legacyTrue.signals).toContain('email_evidence');

    const legacyFalse = await computeReportConfidence(opts({ hasEmailEvidence: false }));
    expect(legacyFalse.score).toBe(0.4);
    expect(legacyFalse.signals).not.toContain('email_evidence');
  });
});

describe('confidence — other signals', () => {
  it('adds corroboration per report', async () => {
    const c = await computeReportConfidence(opts({ corroboratingCount: 2 }));
    expect(c.score).toBe(0.6);
    expect(c.signals).toContain('corroborating_reports');
  });

  it('caps the corroboration bonus', async () => {
    const c = await computeReportConfidence(opts({ corroboratingCount: 20 }));
    expect(c.score).toBe(0.65); // 0.40 + capped 0.25
  });

  it('adds the reputation bonus at 5+ prior reports', async () => {
    const below = await computeReportConfidence(opts({ contributorReportCount: 4 }));
    expect(below.signals).not.toContain('contributor_reputation');

    const at = await computeReportConfidence(opts({ contributorReportCount: 5 }));
    expect(at.score).toBe(0.45);
    expect(at.signals).toContain('contributor_reputation');
  });

  it('adds the timeline bonus only within 14 days', async () => {
    const recent = await computeReportConfidence(
      opts({ interviewDate: RECENT_INTERVIEW, submittedAt: SUBMITTED_AT }),
    );
    expect(recent.signals).toContain('timeline_consistency');
    expect(recent.score).toBe(0.45);

    const old = await computeReportConfidence(
      opts({ interviewDate: OLD_INTERVIEW, submittedAt: SUBMITTED_AT }),
    );
    expect(old.signals).not.toContain('timeline_consistency');
  });

  it('adds the detail bonus for 3+ questions and 500+ chars', async () => {
    const c = await computeReportConfidence(
      opts({ questionsLength: 3, reportTextLength: 500 }),
    );
    expect(c.signals).toContain('detailed_report');
    expect(c.score).toBe(0.45);

    const thin = await computeReportConfidence(
      opts({ questionsLength: 2, reportTextLength: 900 }),
    );
    expect(thin.signals).not.toContain('detailed_report');
  });
});

describe('confidence — cap and shape', () => {
  it('caps confidence at the configured maximum', async () => {
    const c = await computeReportConfidence(
      opts({
        evidenceStatus: 'plausible',
        evidenceKind: 'email',
        corroboratingCount: 10,
        contributorReportCount: 10,
        interviewDate: RECENT_INTERVIEW,
        submittedAt: SUBMITTED_AT,
        questionsLength: 5,
        reportTextLength: 1200,
      }),
    );
    expect(c.score).toBe(0.95);
  });

  it('returns a persistable, UI-compatible shape', async () => {
    const c = await computeReportConfidence(opts({ evidenceStatus: 'plausible' }));
    expect(c).toMatchObject({
      score: expect.any(Number),
      level: expect.any(String),
      label: expect.any(String),
      evidence_status: expect.any(String),
    });
    expect(Array.isArray(c.signals)).toBe(true);
    expect(['low', 'medium', 'high']).toContain(c.level);
  });

  it('classifies levels consistently with the score', async () => {
    expect((await computeReportConfidence(opts())).level).toBe('low');
    expect((await computeReportConfidence(opts({ evidenceStatus: 'plausible' }))).level).toBe('medium');
    expect(
      (
        await computeReportConfidence(
          opts({
            evidenceStatus: 'plausible',
            corroboratingCount: 5,
            contributorReportCount: 5,
            interviewDate: RECENT_INTERVIEW,
            submittedAt: SUBMITTED_AT,
            questionsLength: 4,
            reportTextLength: 800,
          }),
        )
      ).level,
    ).toBe('high');
  });
});
