import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { internalError, notFound, validationError } from '@/lib/api/errors';
import { applySuggestion } from '@/lib/resume-optimization/engine';

/**
 * PATCH /api/resumes/[id]/copilot/suggestions/[suggestionId]
 * Body: { status: 'accepted'|'rejected'|'edited', editedText? }
 *
 * Accepting or editing a suggestion applies the change to the structured
 * resume, creating a new version snapshot. Rejecting just marks it rejected.
 */
export async function PATCH(request, { params }) {
  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const { id: resumeId, suggestionId } = await params;
    const body = await request.json().catch(() => ({}));
    const status = body.status;

    if (!['accepted', 'rejected', 'edited'].includes(status)) {
      return validationError('status must be accepted, rejected, or edited');
    }

    // Verify resume ownership
    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', resumeId)
      .single();
    if (resumeError || !resume) return notFound('Resume not found');
    if (resume.user_id !== user.id) return notFound('Resume not found');

    // Verify suggestion ownership + existence
    const { data: suggestion, error: sugError } = await supabase
      .from('resume_suggestions')
      .select('*')
      .eq('id', suggestionId)
      .single();
    if (sugError || !suggestion) return notFound('Suggestion not found');
    if (suggestion.user_id !== user.id) return notFound('Suggestion not found');

    if (status === 'edited' && !body.editedText?.trim()) {
      return validationError('editedText is required for status=edited');
    }

    if (status === 'rejected') {
      const { data: rejected, error: rejectError } = await supabase
        .from('resume_suggestions')
        .update({ status: 'rejected' })
        .eq('id', suggestionId)
        .select()
        .single();
      if (rejectError) throw rejectError;
      return NextResponse.json({ data: rejected });
    }

    // accepted or edited — apply to structured data + create new version
    const appliedText = status === 'edited' ? body.editedText : null;

    const result = await applySuggestion({
      supabase,
      resumeId,
      userId: user.id,
      suggestion,
      appliedText,
    });

    const { data: updated, error: updateError } = await supabase
      .from('resume_suggestions')
      .update({
        status,
        edited_text: appliedText || null,
      })
      .eq('id', suggestionId)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({
      data: {
        suggestion: updated,
        version: result.version,
        new_version_number: result.newVersionNumber,
        parsed: result.parsed,
      },
    });
  } catch (err) {
    console.error('PATCH /api/resumes/[id]/copilot/suggestions/[suggestionId]', err);
    return internalError();
  }
}