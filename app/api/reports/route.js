import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { internalError, validationError } from '@/lib/api/errors';
import { getClientIp, rateLimit } from '@/lib/api/rateLimit';
import {
  computeReportConfidence,
  hashEmailEvidence,
} from '@/lib/assessment/reportConfidence';
import { classifyEvidence, earnsEvidenceBonus } from '@/lib/assessment/evidenceValidation';
import { REPORT_LEVELS } from '@/constants/reportLevels';

const OUTCOMES = ['offer', 'advance', 'reject', 'no_response'];

/**
 * POST /api/reports — submit an interview experience report.
 * Body: { company, roleKey?, roleLabel, level?, country?, questionsAsked[], topics[], difficulty?, outcome?, interviewDate?, reportText?, emailEvidence? }
 */
export async function POST(request) {
  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    const company = String(body.company || '').trim();
    const roleLabel = String(body.roleLabel || '').trim();
    const roleKey = body.roleKey ? String(body.roleKey).trim() : null;
    const questionsAsked = Array.isArray(body.questionsAsked)
      ? body.questionsAsked.map((q) => String(q).trim()).filter(Boolean).slice(0, 20)
      : [];
    const topics = Array.isArray(body.topics)
      ? body.topics.map((t) => String(t).trim()).filter(Boolean).slice(0, 15)
      : [];
    const difficulty = body.difficulty != null ? Number(body.difficulty) : null;
    const outcome = body.outcome ? String(body.outcome) : null;
    const level = body.level ? String(body.level).trim() : null;
    const country = body.country ? String(body.country).trim() : null;
    const interviewDate = body.interviewDate ? String(body.interviewDate) : null;
    const reportText = body.reportText ? String(body.reportText) : '';
    const emailEvidence = body.emailEvidence ? String(body.emailEvidence) : '';

    if (!company || !roleLabel) {
      return validationError('company and roleLabel are required');
    }
    if (difficulty != null && (Number.isNaN(difficulty) || difficulty < 1 || difficulty > 5)) {
      return validationError('difficulty must be between 1 and 5');
    }
    if (outcome && !OUTCOMES.includes(outcome)) {
      return validationError(`outcome must be one of: ${OUTCOMES.join(', ')}`);
    }
    if (level && !REPORT_LEVELS.includes(level)) {
      return validationError(`level must be one of: ${REPORT_LEVELS.join(', ')}`);
    }

    // Confidence signals — structural classification only. Plausible evidence
    // is evidence-SHAPED; it is not proof of authenticity (see evidenceValidation.js).
    const evidence = classifyEvidence(emailEvidence);
    const hasPlausibleEvidence = earnsEvidenceBonus(evidence);

    // Corroborating reports: same company + role (if provided)
    let corroboratingQuery = supabase
      .from('interview_reports')
      .select('id', { count: 'exact', head: true })
      .eq('company', company);
    if (roleKey) corroboratingQuery = corroboratingQuery.eq('role_key', roleKey);
    const { count: corroboratingCount } = await corroboratingQuery;

    // Contributor reputation: prior published reports by this user
    const { count: priorCount } = await supabase
      .from('interview_reports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const confidence = await computeReportConfidence({
      supabase,
      evidenceStatus: evidence.status,
      evidenceKind: evidence.kind,
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
        level,
        country,
        questions_asked: questionsAsked,
        topics,
        difficulty: difficulty != null && Number.isFinite(difficulty) ? difficulty : null,
        outcome: outcome || null,
        interview_date: interviewDate,
        report_text: reportText || null,
        // Only hash evidence that is actually evidence-shaped, so junk input
        // is never persisted as an evidence fingerprint.
        email_evidence_hashed: hasPlausibleEvidence ? hashEmailEvidence(evidence.value) : null,
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
 * Query: company, role, level, country, q, page, limit, sort=recent|confidence
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
    const level = searchParams.get('level');
    const country = searchParams.get('country');
    const q = searchParams.get('q');

    let query = supabase
      .from('interview_reports')
      .select('*', { count: 'exact' })
      .eq('status', 'published')
      // Order by the extracted score, NOT the `confidence` JSONB column.
      // Ordering the JSONB directly sorts structurally (by its `label`/`level`
      // keys) rather than by score — which silently mis-ordered "Highest
      // confidence". The extracted value compares correctly for scores in
      // [0, 1) and matches the existing idx_reports_confidence index.
      .order(sort === 'confidence' ? 'confidence->>score' : 'created_at', {
        ascending: sort !== 'confidence',
      });

    query = applyReportFilters(query, { company, role, level, country, q });

    const { data, error, count } = await query.range(from, to);

    // PostgREST answers a range whose offset runs past the end of the result set
    // with PGRST103 instead of an empty page. Paging past the end is an ordinary
    // client action (a stale page number after a filter narrows the results), so
    // resolve the true total and return an empty page rather than a 500.
    if (error?.code === 'PGRST103') {
      const { count: fallbackTotal } = await applyReportFilters(
        supabase
          .from('interview_reports')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'published'),
        { company, role, level, country, q },
      );
      return NextResponse.json({
        data: [],
        meta: { page, limit, total: fallbackTotal ?? 0, sort },
      });
    }

    if (error) throw error;

    // Strip private info (email_evidence_hashed) and shape for public view
    const shaped = (data || []).map((r) => ({
      id: r.id,
      company: r.company,
      role_key: r.role_key,
      role_label: r.role_label,
      level: r.level,
      country: r.country,
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

/** Shared filter chain so the ranged read and the fallback count cannot diverge. */
function applyReportFilters(query, { company, role, level, country, q }) {
  let next = query;
  if (company) next = next.eq('company', company);
  if (role) next = next.eq('role_key', role);
  if (level) next = next.eq('level', level);
  if (country) next = next.eq('country', country);
  if (q) {
    next = next.or(`company.ilike.%${q}%,role_label.ilike.%${q}%,report_text.ilike.%${q}%`);
  }
  return next;
}

// Lazy import to avoid coupling anon browse to SSR supabase server client
async function createAnonClient() {
  const { createClient } = await import('@/lib/supabase/server');
  return createClient();
}