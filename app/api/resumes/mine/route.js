import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { toOwnerResume } from '@/lib/dto/resume';
import { internalError } from '@/lib/api/errors';

export async function GET() {
  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const { data, error } = await supabase
      .from('resumes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data: (data || []).map(toOwnerResume) });
  } catch (err) {
    console.error('GET /api/resumes/mine', err);
    return internalError();
  }
}
