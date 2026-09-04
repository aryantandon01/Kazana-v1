import { describe, it, expect, beforeEach } from 'vitest';
import {
  RESUME_ACTION_TO_OPERATION,
  resolveResumeOperationSlug,
  getOperationCatalog,
  getOperation,
  getCreditCost,
  refreshCatalog,
} from '@/lib/credits/catalog';

const OPS = [
  { slug: 'resume_analysis', display_name: 'Resume Analysis', feature: 'resume_optimization', credit_cost: 0, enabled: true },
  { slug: 'resume_optimization', display_name: 'Resume Optimization', feature: 'resume_optimization', credit_cost: 5, enabled: true },
  { slug: 'resume_tailoring', display_name: 'Resume Tailoring', feature: 'resume_optimization', credit_cost: 8, enabled: true },
  { slug: 'resume_rewrite', display_name: 'Resume Rewrite', feature: 'resume_optimization', credit_cost: 3, enabled: true },
];

const fakeAdmin = {
  from: (table) => ({
    select: () => ({
      data: OPS,
      error: null,
      eq: (col, value) => ({
        maybeSingle: () => ({ data: OPS.find((op) => op[col] === value) || null, error: null }),
      }),
    }),
    eq: (col, value) => ({
      maybeSingle: () => ({ data: OPS.find((op) => op[col] === value) || null, error: null }),
    }),
  }),
};

describe('AI operation catalog', () => {
  beforeEach(() => {
    refreshCatalog();
  });

  it('maps every resume copilot action to a billable operation', () => {
    expect(RESUME_ACTION_TO_OPERATION).toMatchObject({
      general_review: 'resume_optimization',
      ats_review: 'resume_optimization',
      rewrite_bullets: 'resume_rewrite',
      rewrite_summary: 'resume_rewrite',
      optimize_for_job: 'resume_tailoring',
    });
  });

  it('falls back to resume_optimization for unknown actions', () => {
    expect(resolveResumeOperationSlug('unknown_action')).toBe('resume_optimization');
    expect(resolveResumeOperationSlug(undefined)).toBe('resume_optimization');
  });

  it('loads the catalog from the database keyed by slug', async () => {
    const catalog = await getOperationCatalog(fakeAdmin);
    expect(catalog.resume_optimization.credit_cost).toBe(5);
    expect(catalog.resume_analysis.credit_cost).toBe(0);
  });

  it('resolves configured credit costs (never hardcoded)', async () => {
    expect(await getCreditCost('resume_analysis', fakeAdmin)).toBe(0);
    expect(await getCreditCost('resume_optimization', fakeAdmin)).toBe(5);
    expect(await getCreditCost('resume_tailoring', fakeAdmin)).toBe(8);
    expect(await getCreditCost('resume_rewrite', fakeAdmin)).toBe(3);
  });

  it('returns null / cost 0 for unknown operations', async () => {
    expect(await getOperation('does_not_exist', fakeAdmin)).toBeNull();
    expect(await getCreditCost('does_not_exist', fakeAdmin)).toBe(0);
  });
});
