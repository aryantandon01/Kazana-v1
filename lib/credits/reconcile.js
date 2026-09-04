/**
 * Scheduled credit reconciliation (cron):
 *  1. release stale reservations — AI calls that crashed after reserving
 *     credits are refunded automatically (users never lose credits to infra)
 *  2. materialize expired credits as auditable 'expiration' rows
 *  3. process monthly subscription credit grants (idempotent)
 */
import { getAdminClient } from '@/lib/supabase/admin';

export async function runCreditReconciliation({ maxAgeMinutes = 15 } = {}) {
  const admin = getAdminClient();

  const [staleRes, expiredRes, grantsRes] = await Promise.all([
    admin.rpc('release_stale_reservations', { p_max_age_minutes: maxAgeMinutes }),
    admin.rpc('credit_expire', { p_user_id: null }),
    admin.rpc('process_monthly_grants', {}),
  ]);

  const summarize = (label, res) => {
    if (res.error) {
      console.error(`credit reconcile: ${label} failed`, res.error);
      return { ok: false, error: res.error.message };
    }
    return { ok: true, count: res.data ?? 0 };
  };

  return {
    stale_reservations_released: summarize('release_stale_reservations', staleRes),
    credits_expired: summarize('credit_expire', expiredRes),
    monthly_grants_issued: summarize('process_monthly_grants', grantsRes),
  };
}
