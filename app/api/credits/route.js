import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { internalError } from '@/lib/api/errors';
import { getUserEntitlements } from '@/lib/credits/entitlements';
import { transactionLabel } from '@/lib/credits/format';
import { parsePagination } from '@/lib/api/pagination';

/**
 * GET /api/credits — current balance, plan, this-month usage, recent activity.
 * All reads go through the authenticated (RLS-scoped) client: users can only
 * ever see their own ledger.
 */
export async function GET(request) {
  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const { limit } = parsePagination(searchParams, { defaultLimit: 8, maxLimit: 50 });

    const summary = await getUserEntitlements(supabase, user.id);

    // This month: usage consumed vs allowance.
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    const [{ data: usageTx }, { data: recentTx }, { data: operations }] = await Promise.all([
      supabase
        .from('credit_transactions')
        .select('amount')
        .eq('user_id', user.id)
        .eq('transaction_type', 'usage')
        .gte('created_at', monthStart),
      supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(0, limit - 1),
      supabase.from('ai_operations').select('slug, display_name'),
    ]);

    const operationsMap = Object.fromEntries((operations || []).map((op) => [op.slug, op]));
    const usedThisMonth = (usageTx || []).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    return NextResponse.json({
      data: {
        plan: summary.plan,
        ai_credits: summary.ai_credits,
        reserved_credits: summary.reserved_credits,
        entitlements: summary.entitlements,
        operations: summary.operations,
        this_month: {
          allowance: summary.plan.monthly_credit_grant || 0,
          used: usedThisMonth,
        },
        recent_activity: (recentTx || []).map((tx) => ({
          id: tx.id,
          amount: tx.amount,
          transaction_type: tx.transaction_type,
          feature: tx.feature,
          operation_slug: tx.operation_slug,
          reference_id: tx.reference_id,
          label: transactionLabel(tx, operationsMap),
          created_at: tx.created_at,
        })),
      },
    });
  } catch (err) {
    console.error('GET /api/credits', err);
    return internalError();
  }
}
