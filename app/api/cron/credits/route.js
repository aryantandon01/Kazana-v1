import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api/errors';
import { runCreditReconciliation } from '@/lib/credits/reconcile';

/**
 * Cron endpoint: credit reconciliation (stale reservations, expiry, monthly grants).
 * Protect with CRON_SECRET header (same pattern as /api/cron/match).
 */
export async function POST(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid cron secret' } }, { status: 401 });
  }

  try {
    const result = await runCreditReconciliation();
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('POST /api/cron/credits', err);
    return internalError();
  }
}
