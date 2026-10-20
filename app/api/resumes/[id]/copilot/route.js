import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { internalError, notFound, validationError } from '@/lib/api/errors';
import {
  ensureResumeParsed,
  generateSuggestions,
} from '@/lib/resume-optimization/engine';
import { shapeJobSemantics } from '@/lib/jobs/semantic';

/**
 * GET /api/resumes/[id]/copilot
 * Loads (or creates) a copilot session for this resume.
 * Proactively parses the resume (if needed) and returns the quality analysis
 * as the first message — the user never has to ask first.
 */
export async function GET(request, { params }) {
  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await params;

    // Preflight: verify the migration has been applied (new tables/columns).
    // Return a clear, actionable error instead of a generic 500.
    const schemaIssue = await detectMissingSchema(supabase);
    if (schemaIssue) return schemaIssue;

    // Verify ownership
    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', id)
      .single();
    if (resumeError || !resume) return notFound('Resume not found');
    if (resume.user_id !== user.id) return notFound('Resume not found');

    // Find or create the optimization session FIRST — the chat shell must
    // open even when lazy parsing is slow or fails. If parsing fails, the
    // UI can still show the session and let the user retry.
    const { data: existing } = await supabase
      .from('resume_optimization_sessions')
      .select('*')
      .eq('resume_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let session = existing;
    if (!session) {
      const { data: created, error: createError } = await supabase
        .from('resume_optimization_sessions')
        .insert({ resume_id: id, user_id: user.id, messages: [] })
        .select()
        .single();
      if (createError) throw createError;
      session = created;
    }

    // Ensure parsed structured data exists (triggers parse on first open).
    // Degrade gracefully if parsing fails — the session/messages still load
    // so the UI can surface the error and let the user retry.
    let parsed = {};
    let quality = null;
    let isNewParse = false;
    let parseError = null;
    try {
      const result = await ensureResumeParsed(supabase, id);
      parsed = result.parsed;
      quality = result.quality;
      isNewParse = result.isNew;
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
      await supabase
        .from('resumes')
        .update({ parsed_status: 'error' })
        .eq('id', id)
        .catch(() => {});
    }

    // Build the proactive first message if the session is empty
    const messages = session.messages || [];
    if (!messages.length) {
      const firstMessage = parseError
        ? {
            summary: `I couldn't parse this resume yet: ${parseError}`,
            suggestedNext: 'Please try again in a moment, or check that the PDF contains selectable text.',
          }
        : buildProactiveMessage(resume, quality, parsed);
      messages.push({ role: 'assistant', content: firstMessage, type: parseError ? 'error' : 'analysis', createdAt: new Date().toISOString() });
      await supabase
        .from('resume_optimization_sessions')
        .update({ messages })
        .eq('id', session.id);
    }

    const { data: pendingSuggestions } = await supabase
      .from('resume_suggestions')
      .select('*')
      .eq('session_id', session.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    return NextResponse.json({
      data: {
        session: { ...session, messages },
        resume: { id: resume.id, name: resume.name, file_url: resume.file_url, parsed_status: parseError ? 'error' : resume.parsed_status },
        parsed,
        quality,
        isNewParse,
        parse_error: parseError,
        pending_suggestions: pendingSuggestions || [],
      },
    });
  } catch (err) {
    console.error('GET /api/resumes/[id]/copilot', err);
    return internalError();
  }
}

/**
 * POST /api/resumes/[id]/copilot
 * Send a chat message. Supports:
 *   { message, action: 'general_review'|'ats_review'|'optimize_for_job'|'rewrite_bullets'|'rewrite_summary', jobId? }
 */
export async function POST(request, { params }) {
  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const schemaIssue = await detectMissingSchema(supabase);
    if (schemaIssue) return schemaIssue;

    const { data: resume, error: resumeError } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', id)
      .single();
    if (resumeError || !resume) return notFound('Resume not found');
    if (resume.user_id !== user.id) return notFound('Resume not found');

    const { data: session, error: sessionError } = await supabase
      .from('resume_optimization_sessions')
      .select('*')
      .eq('resume_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sessionError) throw sessionError;

    // Self-heal: if no session exists (e.g. the GET errored during first
    // parse and never created one), create it here so the API is idempotent
    // and never hard-fails.
    if (!session) {
      const { data: created, error: createError } = await supabase
        .from('resume_optimization_sessions')
        .insert({ resume_id: id, user_id: user.id, messages: [] })
        .select()
        .single();
      if (createError) throw createError;
      session = created;
    }

    // Parse may fail (PDF fetch, pdfjs, LLM). Degrade gracefully with a
    // structured message so the UI surfaces the reason instead of a 500.
    let parsed = {};
    let parseError = null;
    try {
      const result = await ensureResumeParsed(supabase, id);
      parsed = result.parsed;
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }

    const userMessage = {
      role: 'user',
      content: body.message ? String(body.message) : '',
      action: body.action || null,
      createdAt: new Date().toISOString(),
    };

    const action = body.action || 'general_review';
    let jobContext = null;
    let jobId = body.jobId || null;

    // Load job context for optimization (canonical extraction fields — no raw description parsing)
    if (action === 'optimize_for_job' || jobId) {
      if (jobId) {
        const { data: job } = await supabase
          .from('jobs')
          .select('id, title, company_name, job_facets(facets(facet_type, facet_value)), job_tags(tags(tag_name))')
          .eq('id', jobId)
          .maybeSingle();
        if (job) {
          const shaped = shapeJobSemantics(job);
          jobContext = {
            title: shaped.title || '',
            company: shaped.company_name || '',
            skills: (shaped.tags || []).slice(0, 15).map((t) => t.name || t.slug),
            careerAreas: (shaped.career_areas || []).slice(0, 8).map((a) => a.label || a.value),
          };
        }
      }

      // Update session job context
      await supabase.from('resume_optimization_sessions').update({ job_id: jobId || null }).eq('id', session.id);
    }

    const goal = resolveGoal(action, body.message, jobContext);

    // Generate AI suggestions — LLM persistence can fail. Degrade to a clear
    // chat message instead of surfacing a raw 500.
    let result = { analysis: '', suggestions: [], questions: [] };
    try {
      result = await generateSuggestions({
        supabase,
        sessionId: session.id,
        userId: user.id,
        parsed,
        goal,
        jobContext,
      });
    } catch (err) {
      const suggestionError = err instanceof Error ? err.message : String(err);
      result = {
        analysis: parseError
          ? `I couldn't analyze this resume yet: ${parseError}`
          : `I hit an issue generating suggestions: ${suggestionError}. Please try again shortly.`,
        suggestions: [],
        questions: [],
      };
    }

    const assistantMessage = {
      role: 'assistant',
      content: result.analysis || 'Here are some suggestions.',
      type: 'suggestions',
      suggestionIds: (result.suggestions || []).map((s) => s.id),
      questions: result.questions || [],
      jobContext: jobContext
        ? { title: jobContext.title, company: jobContext.company }
        : null,
      createdAt: new Date().toISOString(),
    };

    const updatedMessages = [...(session.messages || []), userMessage, assistantMessage];
    await supabase
      .from('resume_optimization_sessions')
      .update({ messages: updatedMessages })
      .eq('id', session.id);

    return NextResponse.json({
      data: {
        session: { ...session, messages: updatedMessages },
        user_message: userMessage,
        assistant_message: assistantMessage,
        suggestions: result.suggestions || [],
        questions: result.questions || [],
      },
    });
  } catch (err) {
    console.error('POST /api/resumes/[id]/copilot', err);
    return internalError();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCHEMA_NOT_READY_HINT =
  'Resume Copilot tables are not set up yet. Run db/migrations/20260807010000_resume_copilot.sql in the Supabase SQL Editor, then retry.';

/**
 * Detect whether the Resume Copilot migration has been applied.
 * @param {object} supabase
 * @returns {Promise<NextResponse|null>} A helpful error response, or null when schema is ready.
 */
async function detectMissingSchema(supabase) {
  // Lightweight probe: the new column only exists after the migration.
  const { error } = await supabase.from('resumes').select('parsed_status').limit(1);

  const message = error?.message || '';
  const schemaMissing =
    message.includes('schema cache') ||
    message.includes('Could not find') ||
    message.includes('parsed_status') ||
    message.includes('does not exist') ||
    (message.includes('column') && message.includes('of relation'));

  if (!schemaMissing) return null;

  console.warn('Resume Copilot: migration not applied', message);
  return NextResponse.json(
    { error: { code: 'SCHEMA_NOT_READY', message: SCHEMA_NOT_READY_HINT } },
    { status: 500 },
  );
}

function buildProactiveMessage(resume, quality, parsed) {
  const pct = (n) => Math.round(Number(n) * 100);
  const topStrength = quality.strengths[0] || 'Foundation looks good';
  const topPriority = quality.priorities[0] || 'No urgent improvements detected';
  const experienceCount = (parsed.experience || []).length;
  const skillCount = (parsed.skills || []).length;

  return {
    summary:
      `Hey! I've reviewed "${resume.name || 'your resume'}". Overall quality: **${pct(quality.overallScore)}** ` +
      `(ATS compatibility: ${pct(quality.dimensionScores?.ats_compatibility || 0)}%).`,
    analysis: {
      overallScore: quality.overallScore,
      dimensionScores: quality.dimensionScores,
    },
    strongest: topStrength,
    opportunity: topPriority,
    highlights: {
      experience: experienceCount ? `${experienceCount} experience entr${experienceCount === 1 ? 'y' : 'ies'}` : 'No experience found',
      skills: skillCount ? `${skillCount} skills listed` : 'No skills found',
    },
    suggestedNext: 'If you tell me which job you are targeting, I can tailor the resume to it. Or pick an action below.',
  };
}

function resolveGoal(action, userMessage, jobContext) {
  switch (action) {
    case 'ats_review':
      return 'Perform an ATS compatibility review and suggest ATS-friendly fixes.';
    case 'rewrite_bullets':
      return 'Rewrite weak experience bullets to be stronger with quantified impact.';
    case 'rewrite_summary':
      return 'Rewrite the professional summary to be more compelling and keyword-rich.';
    case 'optimize_for_job':
      return jobContext
        ? `Optimize this resume for the target role: ${jobContext.title} at ${jobContext.company}.`
        : 'Optimize this resume for a specific target job.';
    case 'general_review':
    default:
      return userMessage || 'Review this resume and suggest the highest-impact improvements.';
  }
}