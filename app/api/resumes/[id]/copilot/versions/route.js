import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { internalError, notFound } from '@/lib/api/errors';

/**
 * GET /api/resumes/[id]/copilot/versions
 * Version history for a resume (snapshots of structured data).
 */
export async function GET(request, { params }) {
  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await params;

    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', id)
      .single();
    if (resumeError || !resume) return notFound('Resume not found');
    if (resume.user_id !== user.id) return notFound('Resume not found');

    const { data: versions, error } = await supabase
      .from('resume_versions')
      .select('id, resume_id, version_number, change_summary, created_at')
      .eq('resume_id', id)
      .eq('user_id', user.id)
      .order('version_number', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      data: versions || [],
      meta: {
        current_version_number: resume.current_version_number || 1,
      },
    });
  } catch (err) {
    console.error('GET /api/resumes/[id]/copilot/versions', err);
    return internalError();
  }
}

/**
 * POST /api/resumes/[id]/copilot/versions
 * Body: { versionId } — restore an older version as current.
 * Creates a NEW version snapshot (never overwrites history).
 */
export async function POST(request, { params }) {
  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const versionId = body.versionId;

    if (!versionId) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'versionId is required' } }, { status: 400 });
    }

    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', id)
      .single();
    if (resumeError || !resume) return notFound('Resume not found');
    if (resume.user_id !== user.id) return notFound('Resume not found');

    // Load the requested version
    const { data: version, error: vError } = await supabase
      .from('resume_versions')
      .select('*')
      .eq('id', versionId)
      .eq('resume_id', id)
      .eq('user_id', user.id)
      .single();
    if (vError || !version) return notFound('Version not found');

    const nextVersion = (resume.current_version_number || 1) + 1;

    // Create a new snapshot from the restored version (append-only)
    const { data: newVersion, error: insertError } = await supabase
      .from('resume_versions')
      .insert({
        resume_id: id,
        user_id: user.id,
        version_number: nextVersion,
        parsed_data: version.parsed_data,
        change_summary: `Restored from version ${version.version_number}`,
      })
      .select()
      .single();
    if (insertError) throw insertError;

    // Update canonical parsed data + current pointer
    await supabase
      .from('resume_parsed_data')
      .update({ parsed_json: version.parsed_data, version_id: newVersion.id, updated_at: new Date().toISOString() })
      .eq('resume_id', id);

    await supabase.from('resumes').update({ current_version_number: nextVersion }).eq('id', id);

    return NextResponse.json({ data: { version: newVersion, parsed: version.parsed_data } });
  } catch (err) {
    console.error('POST /api/resumes/[id]/copilot/versions', err);
    return internalError();
  }
}