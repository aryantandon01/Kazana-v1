import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { internalError, validationError } from '@/lib/api/errors';
import { getClientIp, rateLimit } from '@/lib/api/rateLimit';
import {
  computeReportConfidence,
  hashEmailEvidence,
} from '@/lib/assessment/reportConfidence';

const STAGES = ['phone_screen', 'technical', 'system_design', 'behavioral', 'onsite', 'final'];
const OUTCOMES = ['offer', 'advance', 'reject', 'no_response'];

/**
 * POST /api/reports — submit an interview experience report.
 * Body: { company, roleKey?, roleLabel, stage, questionsAsked[], topics[], difficulty?, outcome?, interviewDate?, reportText?, emailEvidence? }
 */
export async function POST(request) {
  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    const company = String(body.company || '').trim();
    const roleLabel = String(body.roleLabel || '').trim();
    const stage = String(body.stage || '').trim();
    const roleKey = body.roleKey ? String(body.roleKey).trim() : null;
    const questionsAsked = Array.isArray(body.questionsAsked)
      ? body.questionsAsked.map((q) => String(q).trim()).filter(Boolean).slice(0, 20)
      : [];
    const topics = Array.isArray(body.topics)
      ? body.topics.map((t) => String(t).trim()).filter(Boolean).slice(0, 15)
      : [];
    const difficulty = body.difficulty != null ? Number(body.difficulty) : null;
    const outcome = body.outcome ? String(body.outcome) : null;
    const interviewDate = body.interviewDate ? String(body.interviewDate) : null;
    const reportText = body.reportText ? String(body.reportText) : '';
    const emailEvidence = body.emailEvidence ? String(body.emailEvidence) : '';

    if (!company || !roleLabel) {
      return validationError('company and roleLabel are required');
    }
    if (!STAGES.includes(stage)) {
      return validationError(`stage must be one of: ${STAGES.join(', ')}`);
    }
    if (difficulty != null && (Number.isNaN(difficulty) || difficulty < 1 || difficulty > 5)) {
      return validationError('difficulty must be between 1 and 5');
    }
    if (outcome && !OUTCOMES.includes(outcome)) {
      return validationError(`outcome must be one of: ${OUTCOMES.join(', ')}`);
    }

    // Confidence signals
    const hasEmailEvidence = Boolean(emailEvidence.trim());

    // Corroborating reports: same company + role (if provided) + stage
    let corroboratingQuery = supabase
      .from('interview_reports')
      .select('id', { count: 'exact', head: true })
      .eq('company', company)
      .eq('stage', stage);
    if (roleKey) corroboratingQuery = corroboratingQuery.eq('role_key', roleKey);
    const { count: corroboratingCount } = await corroboratingQuery;

    // Contributor reputation: prior published reports by this user
    const { count: priorCount } = await supabase
      .from('interview_reports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const confidence = await computeReportConfidence({
      supabase,
      hasEmailEvidence,
      corroboratingCount: corroboratingCount || 0,
      contributorReportCount: priorCount || 0,
      interviewDate,
      submittedAt: new Date().toISOString(),
      questionsLength: questionsAsked.length,
      reportTextLength: reportText.length,
    });

    const { data: report, error } = await supabase
      .from('interview_reports')
      .insert({
        user_id: user.id,
        company,
        role_key: roleKey,
        role_label: roleLabel,
        stage,
        questions_asked: questionsAsked,
        topics,
        difficulty: difficulty != null && Number.isFinite(difficulty) ? difficulty : null,
        outcome: outcome || null,
        interview_date: interviewDate,
        report_text: reportText || null,
        email_evidence_hashed: hasEmailEvidence ? hashEmailEvidence(emailEvidence) : null,
        status: 'published',
        confidence,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data: report }, { status: 201 });
  } catch (err) {
    console.error('POST /api/reports', err);
    return internalError();
  }
}

/**
 * GET /api/reports — browse published interview reports.
 * Query: company, role, stage, q, page, limit, sort=recent|confidence
 */
export async function GET(request) {
  const ip = getClientIp(request);
  if (!rateLimit(`reports-list:${ip}`, { limit: 120 })) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      { status: 429 },
    );
  }

  try {
    const supabase = await createAnonClient();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(searchParams.get('limit') || '10', 10) || 10));
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const sort = searchParams.get('sort') === 'confidence' ? 'confidence' : 'recent';
    const company = searchParams.get('company');
    const role = searchParams.get('role');
    const stage = searchParams.get('stage');
    const q = searchParams.get('q');

    let query = supabase
      .from('interview_reports')
      .select('*', { count: 'exact' })
      .eq('status', 'published')
      .order(sort === 'confidence' ? 'confidence' : 'created_at', {
        ascending: sort !== 'confidence',
      });

    if (company) query = query.eq('company', company);
    if (stage) query = query.eq('stage', stage);
    if (role) query = query.eq('role_key', role);
    if (q) {
      query = query.or(`company.ilike.%${q}%,role_label.ilike.%${q}%,report_text.ilike.%${q}%`);
    }

    const { data, error, count } = await query.range(from, to);
    if (error) throw error;

    // Strip private info (email_evidence_hashed) and shape for public view
    const shaped = (data || []).map((r) => ({
      id: r.id,
      company: r.company,
      role_key: r.role_key,
      role_label: r.role_label,
      stage: r.stage,
      questions_asked: r.questions_asked,
      topics: r.topics,
      difficulty: r.difficulty,
      outcome: r.outcome,
      interview_date: r.interview_date,
      report_text: r.report_text,
      created_at: r.created_at,
      confidence: r.confidence,
    }));

    return NextResponse.json({
      data: shaped,
      meta: {
        page,
        limit,
        total: count ?? shaped.length,
        sort,
      },
    });
  } catch (err) {
    console.error('GET /api/reports', err);
    return internalError();
  }
}

// Lazy import to avoid coupling anon browse to SSR supabase server client
async function createAnonClient() {
  const { createClient } = await import('@/lib/supabase/server');
  return createClient();
}