import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { internalError } from '@/lib/api/errors';
import { getUserEntitlements } from '@/lib/credits/entitlements';

/**
 * GET /api/entitlements — plan, credit balance, and feature access for the
 * authenticated user. Display data only; the backend independently enforces
 * every entitlement (never trust a client-claimed plan).
 */
export async function GET() {
  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const data = await getUserEntitlements(supabase, user.id);
    return NextResponse.json({ data });
  } catch (err) {
    console.error('GET /api/entitlements', err);
    return internalError();
  }
}
