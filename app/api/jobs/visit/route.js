import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { getClientIp, rateLimit } from '@/lib/api/rateLimit';
import { internalError, rateLimited } from '@/lib/api/errors';

/**
 * Record that the user opened the Jobs feed (powers future "new since last visit").
 * POST /api/jobs/visit
 */
export async function POST(request) {
  const ip = getClientIp(request);
  if (!rateLimit(`jobs-visit:${ip}`, { limit: 60 })) {
    return rateLimited();
  }

  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert(
        {
          user_id: user.id,
          last_jobs_visit_at: now,
          updated_at: now,
        },
        { onConflict: 'user_id' },
      )
      .select('last_jobs_visit_at')
      .single();

    if (error) throw error;

    return NextResponse.json({ data: { last_jobs_visit_at: data.last_jobs_visit_at } });
  } catch (err) {
    console.error('POST /api/jobs/visit', err);
    return internalError();
  }
}
