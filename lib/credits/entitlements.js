/**
 * Entitlement service — the server-side source of truth for what a user can
 * do. The frontend may display this data, but the backend independently
 * enforces it. NEVER trust a client-sent `isPremium` flag.
 */
import { getAdminClient } from '@/lib/supabase/admin';
import { getBalance } from './ledger';

const FREE_FALLBACK = { slug: 'free', name: 'Free', price: 0, currency: 'inr', monthly_credit_grant: 0 };

/**
 * User-facing summary (RLS-respecting reads through the authenticated client).
 * @param {object} supabase - user-scoped Supabase client from requireAuth()
 * @param {string} userId
 * @returns {Promise<{ plan: object, ai_credits: number, reserved_credits: number, entitlements: object, operations: object }>}
 */
export async function getUserEntitlements(supabase, userId) {
  const [{ data: credits }, { data: subscription }, { data: plans }, { data: allEntitlements }, { data: operations }] =
    await Promise.all([
      supabase.from('user_credits').select('*').eq('user_id', userId).maybeSingle(),
      supabase
        .from('subscriptions')
        .select('*, plans(slug, name, price, currency, billing_interval, monthly_credit_grant)')
        .eq('user_id', userId)
        .in('status', ['active', 'trialing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('plans').select('*'),
      supabase.from('plan_entitlements').select('plan_id, feature_key, enabled, max_limit'),
      supabase.from('ai_operations').select('slug, display_name, feature, credit_cost, enabled'),
    ]);

  const plan = subscription?.plans || FREE_FALLBACK;

  // Resolve the entitlement map for the user's plan.
  const entitlements = {};
  for (const e of allEntitlements || []) {
    if (e.plan_id === (subscription?.plan_id || null)) {
      entitlements[e.feature_key] = e.enabled;
    }
  }
  // Default to the free plan entitlements when the user has no subscription.
  if (!subscription) {
    const freePlan = (plans || []).find((p) => p.slug === 'free');
    for (const e of allEntitlements || []) {
      if (e.plan_id === freePlan?.id) entitlements[e.feature_key] = e.enabled;
    }
  }

  const operationsMap = {};
  for (const op of operations || []) {
    operationsMap[op.slug] = { display_name: op.display_name, feature: op.feature, credit_cost: op.credit_cost, enabled: op.enabled };
  }

  return {
    plan: {
      slug: plan.slug,
      name: plan.name,
      price: Number(plan.price) || 0,
      currency: plan.currency,
      billing_interval: plan.billing_interval,
      monthly_credit_grant: Number(plan.monthly_credit_grant) || 0,
    },
    ai_credits: credits?.available_credits ?? 0,
    reserved_credits: credits?.reserved_credits ?? 0,
    entitlements,
    operations: operationsMap,
  };
}

/**
 * Server-side entitlement check (admin client). Used by the AI gate.
 * @param {object} admin - service-role client (injected for tests)
 * @param {string} userId
 * @param {string} featureKey - e.g. 'resume_optimization'
 * @returns {Promise<boolean>}
 */
export async function canUseFeature(admin, userId, featureKey) {
  const client = admin || getAdminClient();

  const { data: sub } = await client
    .from('subscriptions')
    .select('plan_id')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let planId = sub?.plan_id || null;
  if (!planId) {
    const { data: freePlan } = await client.from('plans').select('id').eq('slug', 'free').maybeSingle();
    planId = freePlan?.id || null;
  }
  if (!planId) return false;

  const { data: ent } = await client
    .from('plan_entitlements')
    .select('enabled, max_limit')
    .eq('plan_id', planId)
    .eq('feature_key', featureKey)
    .maybeSingle();

  return Boolean(ent?.enabled);
}

/** Admin-client full summary (cron, admin tooling, tests). */
export async function getEntitlementsForUser(admin, userId) {
  const client = admin || getAdminClient();
  const balance = await getBalance(client, userId);
  const { data: sub } = await client
    .from('subscriptions')
    .select('*, plans(slug, name)')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing'])
    .maybeSingle();

  return {
    balance,
    plan: sub?.plans || { slug: 'free', name: 'Free' },
  };
}
