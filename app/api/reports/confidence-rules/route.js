import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api/errors';
import { getClientIp, rateLimit } from '@/lib/api/rateLimit';
import { loadConfidenceRules } from '@/lib/assessment/reportConfidence';

/**
 * GET /api/reports/confidence-rules — public, non-sensitive confidence weights.
 *
 * Exists so product copy ("your report starts at 40%") reflects whatever is
 * configured in `confidence_rules`, instead of a hardcoded number that can
 * silently drift when operators tune the weights.
 *
 * Exposes weights only — never per-user or per-report data.
 */
export async function GET(request) {
  const ip = getClientIp(request);
  if (!rateLimit(`reports-confidence-rules:${ip}`, { limit: 60 })) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      { status: 429 },
    );
  }

  try {
    // `confidence_rules` has a public SELECT policy, so the request-scoped
    // client can read the configured weights without elevated access.
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    const rules = await loadConfidenceRules(supabase);

    return NextResponse.json({
      data: {
        base_confidence: rules.base_confidence,
        max_confidence: rules.max_confidence,
        weights: {
          email_evidence: rules.email_evidence,
          corroboration_per_report: rules.corroboration_per_report,
          corroboration_cap: rules.corroboration_cap,
          contributor_reputation: rules.contributor_reputation,
          timeline_consistency: rules.timeline_consistency,
          detail_bonus: rules.detail_bonus,
        },
      },
    });
  } catch (err) {
    console.error('GET /api/reports/confidence-rules', err);
    return internalError();
  }
}
