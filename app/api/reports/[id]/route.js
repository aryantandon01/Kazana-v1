import { NextResponse } from 'next/server';
import { internalError, notFound } from '@/lib/api/errors';
import { getClientIp, rateLimit } from '@/lib/api/rateLimit';

/**
 * GET /api/reports/[id] — single published interview report (public).
 */
export async function GET(request, { params }) {
  const ip = getClientIp(request);
  if (!rateLimit(`reports-detail:${ip}`, { limit: 120 })) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      { status: 429 },
    );
  }

  try {
    const { id } = await params;
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('interview_reports')
      .select('*')
      .eq('id', id)
      .eq('status', 'published')
      .maybeSingle();

    if (error) throw error;
    if (!data) return notFound('Interview report not found');

    // Strip private information for public view
    const shaped = {
      id: data.id,
      company: data.company,
      role_key: data.role_key,
      role_label: data.role_label,
      stage: data.stage,
      questions_asked: data.questions_asked,
      topics: data.topics,
      difficulty: data.difficulty,
      outcome: data.outcome,
      interview_date: data.interview_date,
      report_text: data.report_text,
      created_at: data.created_at,
      confidence: data.confidence,
    };

    return NextResponse.json({ data: shaped });
  } catch (err) {
    console.error('GET /api/reports/[id]', err);
    return internalError();
  }
}