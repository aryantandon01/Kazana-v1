import { describe, it, expect, vi } from 'vitest';
import { getUserEntitlements } from '@/lib/credits/entitlements';

const FREE_PLAN = { id: 'plan-free', slug: 'free', name: 'Free', price: 0, currency: 'inr', billing_interval: 'month', monthly_credit_grant: 0 };
const PREMIUM_PLAN = { id: 'plan-premium', slug: 'premium', name: 'Premium', price: 499, currency: 'inr', billing_interval: 'month', monthly_credit_grant: 100 };

const ENTITLEMENTS = [
  { plan_id: 'plan-free', feature_key: 'jobs', enabled: true, max_limit: null },
  { plan_id: 'plan-free', feature_key: 'matching', enabled: true, max_limit: null },
  { plan_id: 'plan-free', feature_key: 'resume_optimization', enabled: true, max_limit: null },
  { plan_id: 'plan-free', feature_key: 'advanced_resume_ai', enabled: false, max_limit: null },
  { plan_id: 'plan-premium', feature_key: 'jobs', enabled: true, max_limit: null },
  { plan_id: 'plan-premium', feature_key: 'matching', enabled: true, max_limit: null },
  { plan_id: 'plan-premium', feature_key: 'resume_optimization', enabled: true, max_limit: null },
  { plan_id: 'plan-premium', feature_key: 'advanced_resume_ai', enabled: true, max_limit: null },
];

const OPERATIONS = [
  { slug: 'resume_optimization', display_name: 'Resume Optimization', feature: 'resume_optimization', credit_cost: 5, enabled: true },
];

function mockSupabase({ credits = null, subscription = null, plans = [FREE_PLAN, PREMIUM_PLAN], entitlements = ENTITLEMENTS, operations = OPERATIONS }) {
  const chain = (value) => ({ select: vi.fn().mockReturnValue(value) });

  const valueFor = (table) => {
    switch (table) {
      case 'user_credits':
        return { eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: credits, error: null }) }) };
      case 'subscriptions':
        return {
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: subscription, error: null }) }),
              }),
            }),
          }),
        };
      case 'plans':
        return { select: vi.fn().mockResolvedValue({ data: plans, error: null }) };
      case 'plan_entitlements':
        return { select: vi.fn().mockResolvedValue({ data: entitlements, error: null }) };
      case 'ai_operations':
        return { select: vi.fn().mockResolvedValue({ data: operations, error: null }) };
      default:
        return {};
    }
  };

  return {
    from: vi.fn((table) => {
      const v = valueFor(table);
      // For tables where the first method is select(...)
      if (table === 'plans' || table === 'plan_entitlements' || table === 'ai_operations') return v;
      // user_credits / subscriptions start with select then chain
      return { select: vi.fn().mockReturnValue(v) };
    }),
  };
}

describe('getUserEntitlements', () => {
  it('returns free plan defaults with no subscription', async () => {
    const supabase = mockSupabase({
      credits: { available_credits: 25, reserved_credits: 0 },
      subscription: null,
    });
    const out = await getUserEntitlements(supabase, 'user-1');

    expect(out.plan.slug).toBe('free');
    expect(out.ai_credits).toBe(25);
    expect(out.entitlements.jobs).toBe(true);
    expect(out.entitlements.advanced_resume_ai).toBe(false);
    expect(out.operations.resume_optimization.credit_cost).toBe(5);
  });

  it('returns premium entitlements when the user has an active subscription', async () => {
    const supabase = mockSupabase({
      credits: { available_credits: 120, reserved_credits: 5 },
      subscription: {
        plan_id: 'plan-premium',
        status: 'active',
        plans: PREMIUM_PLAN,
      },
    });
    const out = await getUserEntitlements(supabase, 'user-1');

    expect(out.plan.slug).toBe('premium');
    expect(out.plan.monthly_credit_grant).toBe(100);
    expect(out.ai_credits).toBe(120);
    expect(out.reserved_credits).toBe(5);
    expect(out.entitlements.advanced_resume_ai).toBe(true);
  });

  it('handles a user with no credits row yet', async () => {
    const supabase = mockSupabase({ credits: null, subscription: null });
    const out = await getUserEntitlements(supabase, 'user-1');
    expect(out.ai_credits).toBe(0);
    expect(out.plan.slug).toBe('free');
  });
});
