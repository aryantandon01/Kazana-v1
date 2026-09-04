import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { internalError } from '@/lib/api/errors';
import { transactionLabel } from '@/lib/credits/format';
import { parsePagination } from '@/lib/api/pagination';

/**
 * GET /api/credits/transactions — paginated ledger history for the caller.
 * RLS restricts every row to the authenticated user.
 */
export async function GET(request) {
  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, from, to } = parsePagination(searchParams, { defaultLimit: 20, maxLimit: 100 });

    const [{ data: rows, error, count }, { data: operations }] = await Promise.all([
      supabase
        .from('credit_transactions')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to),
      supabase.from('ai_operations').select('slug, display_name'),
    ]);

    if (error) throw error;

    const operationsMap = Object.fromEntries((operations || []).map((op) => [op.slug, op]));

    return NextResponse.json({
      data: (rows || []).map((tx) => ({
        id: tx.id,
        amount: tx.amount,
        transaction_type: tx.transaction_type,
        feature: tx.feature,
        operation_slug: tx.operation_slug,
        reference_id: tx.reference_id,
        metadata: tx.metadata,
        expires_at: tx.expires_at,
        created_at: tx.created_at,
        label: transactionLabel(tx, operationsMap),
      })),
      meta: {
        page,
        limit,
        total: count ?? 0,
      },
    });
  } catch (err) {
    console.error('GET /api/credits/transactions', err);
    return internalError();
  }
}
