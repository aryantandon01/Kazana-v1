import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/api/auth';
import { getClientIp, rateLimit } from '@/lib/api/rateLimit';
import { toPublicResumes } from '@/lib/dto/resume';
import { internalError, rateLimited, validationError } from '@/lib/api/errors';
import { parsePagination } from '@/lib/api/pagination';
import { resumeCreateSchema } from '@/lib/validation/resume';
import { runMatching } from '@/lib/matching/run';

export async function GET(request) {
  const ip = getClientIp(request);
  if (!rateLimit(`resumes-list:${ip}`, { limit: 120 })) {
    return rateLimited();
  }

  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const { page, limit, from, to } = parsePagination(searchParams);

    const { data, error, count } = await supabase
      .from('resumes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return NextResponse.json({
      data: toPublicResumes(data),
      meta: { page, limit, total: count ?? data?.length ?? 0 },
    });
  } catch (err) {
    console.error('GET /api/resumes', err);
    return internalError();
  }
}

export async function POST(request) {
  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const parsed = resumeCreateSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed.error.flatten().fieldErrors);
    }

    const payload = parsed.data;
    let resumeName = payload.name?.trim();

    if (!resumeName) {
      const { count } = await supabase
        .from('resumes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      resumeName = `Resume ${(count || 0) + 1}`;
    }

    const { data, error } = await supabase
      .from('resumes')
      .insert({
        user_id: user.id,
        companies: payload.companies,
        job_family: payload.job_family,
        level: payload.level,
        years_of_experience: payload.years_of_experience,
        country: payload.country,
        university: payload.university || null,
        name: resumeName,
        file_url: payload.file_url,
      })
      .select()
      .single();

    if (error) throw error;

    // Generate match scores so the Jobs page match indicators and
    // notifications are ready after upload
    let matching = null;
    try {
      matching = await runMatching({
        userId: user.id,
        enqueueNotifications: false,
      });
    } catch (matchErr) {
      console.error('POST /api/resumes matching', matchErr);
    }

    return NextResponse.json({ data, meta: { matching } }, { status: 201 });
  } catch (err) {
    console.error('POST /api/resumes', err);
    return internalError();
  }
}
