import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/api/auth';
import { toPublicResume, toOwnerResume } from '@/lib/dto/resume';
import { forbidden, internalError, notFound, validationError } from '@/lib/api/errors';
import { resumeUpdateSchema } from '@/lib/validation/resume';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return notFound('Resume not found');

    const isOwner = user?.id === data.user_id;
    return NextResponse.json({
      data: isOwner ? toOwnerResume(data) : toPublicResume(data),
      meta: { isOwner },
    });
  } catch (err) {
    console.error('GET /api/resumes/[id]', err);
    return internalError();
  }
}

export async function PATCH(request, { params }) {
  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = resumeUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed.error.flatten().fieldErrors);
    }

    const { data: existing, error: fetchError } = await supabase
      .from('resumes')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return notFound('Resume not found');
    if (existing.user_id !== user.id) return forbidden();

    const updates = { ...parsed.data };
    if (updates.name !== undefined) {
      updates.name = updates.name?.trim() || undefined;
    }
    delete updates.file_path;

    const { data, error } = await supabase
      .from('resumes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data: toOwnerResume(data) });
  } catch (err) {
    console.error('PATCH /api/resumes/[id]', err);
    return internalError();
  }
}

export async function DELETE(request, { params }) {
  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await params;

    const { data: existing, error: fetchError } = await supabase
      .from('resumes')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return notFound('Resume not found');
    if (existing.user_id !== user.id) return forbidden();

    const { error } = await supabase.from('resumes').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ data: { id } });
  } catch (err) {
    console.error('DELETE /api/resumes/[id]', err);
    return internalError();
  }
}
