import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { internalError, rateLimited } from '@/lib/api/errors';
import { getClientIp, rateLimit } from '@/lib/api/rateLimit';
import { parsePagination } from '@/lib/api/pagination';
import { NOTIFICATION_CHANNELS } from '@/lib/notifications/config';

/**
 * GET /api/notifications
 * Read the caller's own notification history (job-match events across channels).
 * `notification_queue` doubles as the event log; RLS restricts rows to the user.
 */
export async function GET(request) {
  const ip = getClientIp(request);
  if (!rateLimit(`notifications-list:${ip}`, { limit: 120 })) return rateLimited();

  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, from, to } = parsePagination(searchParams);
    const channel = searchParams.get('channel');

    let query = supabase
      .from('notification_queue')
      .select(
        'id, job_id, match_id, channel, type, match_score, title, body, payload, status, sent_at, created_at',
        { count: 'exact' },
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (channel && NOTIFICATION_CHANNELS.includes(channel)) {
      query = query.eq('channel', channel);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      data: data || [],
      meta: { page, limit, total: count ?? data?.length ?? 0 },
    });
  } catch (err) {
    console.error('GET /api/notifications', err);
    return internalError();
  }
}
