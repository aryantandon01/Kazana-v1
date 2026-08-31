import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { internalError, notFound } from '@/lib/api/errors';

/**
 * POST /api/resumes/[id]/copilot/export
 * Generates a fresh export from the current structured resume data.
 *
 * MVP: returns the structured resume as a downloadable JSON file
 * (ATS-friendly data) and records it in generated_resume_exports.
 * A PDF rendering library can be swapped in without changing this endpoint's
 * public shape (file_url + downloadUrl still point at the export).
 */
export async function POST(request, { params }) {
  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const template = body.template || 'clean';

    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', id)
      .single();
    if (resumeError || !resume) return notFound('Resume not found');
    if (resume.user_id !== user.id) return notFound('Resume not found');

    // Load canonical structured data
    const { data: parsed, error: parsedError } = await supabase
      .from('resume_parsed_data')
      .select('*')
      .eq('resume_id', id)
      .single();
    if (parsedError || !parsed) return notFound('Resume has not been parsed yet — open Resume Copilot first');

    // Build export payload (ATS-safe structured representation)
    const exportPayload = {
      template,
      exported_at: new Date().toISOString(),
      name: resume.name || parsed.parsed_json?.name || '',
      data: parsed.parsed_json || {},
      parser_version: parsed.parser_version || 'resume-parse-v1',
    };

    // For MVP we generate a JSON file and host it via the admin storage.
    // When a PDF rendering library is added, this same flow uploads a .pdf.
    const { getAdminClient } = await import('@/lib/supabase/admin');
    const admin = getAdminClient();
    const filename = `resume-${id.slice(0, 8)}-${template}.json`;
    const filePath = `${user.id}/exports/${Date.now()}-${filename}`;

    const jsonBytes = Buffer.from(JSON.stringify(exportPayload, null, 2), 'utf8');
    const { error: uploadError } = await admin.storage
      .from('resumes')
      .upload(filePath, jsonBytes, { contentType: 'application/json', upsert: false });
    if (uploadError) throw uploadError;

    const { data: publicData } = admin.storage.from('resumes').getPublicUrl(filePath);

    // Record the export
    const { data: exportRow, error: insertError } = await supabase
      .from('generated_resume_exports')
      .insert({
        resume_id: id,
        user_id: user.id,
        version_id: parsed.version_id || null,
        template,
        file_url: publicData.publicUrl,
      })
      .select()
      .single();
    if (insertError) throw insertError;

    return NextResponse.json({
      data: {
        export: exportRow,
        downloadUrl: publicData.publicUrl,
        note: 'MVP export is structured JSON. A PDF renderer can be plugged into this endpoint without changing the response shape.',
      },
    });
  } catch (err) {
    console.error('POST /api/resumes/[id]/copilot/export', err);
    return internalError();
  }
}