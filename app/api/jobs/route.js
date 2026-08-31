import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getClientIp, rateLimit } from '@/lib/api/rateLimit';
import { parsePagination } from '@/lib/api/pagination';
import { applyJobFilters, parseJobFilters, resolveJobSort } from '@/lib/api/jobFilters';
import { internalError, rateLimited } from '@/lib/api/errors';
import {
  jobListSelect,
  resolveJobIdsByCareerAreas,
  resolveJobIdsByFacetValues,
  resolveJobIdsByTagQuery,
  shapeJobSemantics,
} from '@/lib/jobs/semantic';
import { isEligibleForJob } from '@/lib/matching/eligibility';
import { DEFAULT_MIN_SCORE, scoreJobForUser } from '@/lib/matching/score';

const BEST_MATCH_CANDIDATE_LIMIT = 800;
const BEST_MATCH_ID_CHUNK = 80;

export async function GET(request) {
  const ip = getClientIp(request);
  if (!rateLimit(`jobs-list:${ip}`, { limit: 120 })) {
    return rateLimited();
  }

  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const { page, limit, from, to } = parsePagination(searchParams);
    const filters = parseJobFilters(searchParams);
    const sortParam = searchParams.get('sort') || 'discovered_at';
    const sortDir = searchParams.get('dir') === 'asc';
    const sort = resolveJobSort(sortParam, sortDir);

    let lastJobsVisitAt = null;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (filters.sinceVisit && user) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('last_jobs_visit_at')
        .eq('user_id', user.id)
        .maybeSingle();
      lastJobsVisitAt = profile?.last_jobs_visit_at || null;
    }

    const facetJobIds = await resolveIntersectedFacetJobIds(supabase, filters);
    const tagSearchJobIds = filters.q
      ? await resolveJobIdsByTagQuery(supabase, filters.q)
      : [];

    const filterContext = {
      lastJobsVisitAt,
      facetJobIds,
      tagSearchJobIds,
    };

    // Best Match: rank by live eligibility-first score (not stale stored scores)
    if (sort.mode === 'best_match' && user) {
      const best = await fetchBestMatchPage(supabase, {
        userId: user.id,
        filters,
        filterContext,
        from,
        to,
        limit,
      });
      if (best) {
        return NextResponse.json({
          data: best.data,
          meta: {
            page,
            limit,
            total: best.total,
            sort: 'best_match',
            freshness: filters.freshness,
            last_jobs_visit_at: lastJobsVisitAt,
            semantic: best.semantic,
          },
        });
      }
      // No candidates — fall through to newly discovered
    }

    let query = supabase.from('jobs').select(jobListSelect(), { count: 'exact' });

    if (sort.mode === 'updated') {
      query = query.gt('job_version', 1).order('last_updated_at', {
        ascending: sort.ascending,
        nullsFirst: false,
      });
    } else {
      query = query.order(sort.field === 'score' ? 'discovered_at' : sort.field, {
        ascending: sort.field === 'score' ? false : sort.ascending,
        nullsFirst: false,
      });
    }

    query = applyJobFilters(query, filters, filterContext);

    const { data, error, count } = await query.range(from, to);

    if (error) {
      if (isSemanticSelectError(error)) {
        let fallback = supabase.from('jobs').select('*, job_sources(name, slug)', { count: 'exact' });
        if (sort.mode === 'updated') {
          fallback = fallback.gt('job_version', 1).order('last_updated_at', {
            ascending: sort.ascending,
            nullsFirst: false,
          });
        } else {
          fallback = fallback.order(sort.field === 'score' ? 'discovered_at' : sort.field, {
            ascending: sort.field === 'score' ? false : sort.ascending,
            nullsFirst: false,
          });
        }
        fallback = applyJobFilters(
          fallback,
          { ...filters, jobFamily: filters.jobFamily || '' },
          { lastJobsVisitAt, tagSearchJobIds: [] },
        );
        const retry = await fallback.range(from, to);
        if (retry.error) throw retry.error;
        return NextResponse.json({
          data: retry.data || [],
          meta: {
            page,
            limit,
            total: retry.count ?? retry.data?.length ?? 0,
            sort: sort.mode === 'updated' ? 'last_updated_at' : sort.field,
            freshness: filters.freshness,
            last_jobs_visit_at: lastJobsVisitAt,
            semantic: false,
          },
        });
      }
      throw error;
    }

    return NextResponse.json({
      data: (data || []).map(shapeJobSemantics),
      meta: {
        page,
        limit,
        total: count ?? data?.length ?? 0,
        sort: sort.mode === 'updated' ? 'last_updated_at' : sort.mode === 'best_match' ? 'discovered_at' : sort.field,
        freshness: filters.freshness,
        last_jobs_visit_at: lastJobsVisitAt,
        semantic: true,
      },
    });
  } catch (err) {
    console.error('GET /api/jobs', err);
    return internalError();
  }
}

/**
 * Best Match — LIVE eligibility-first scoring.
 * Ignores stale stored match scores so incompatible/ineligible roles
 * (PM, TPM, senior-on-junior, …) drop out even before the stored
 * `matches` rows are reprocessed.
 * @returns {Promise<{ data: object[], total: number, semantic: boolean }|null>}
 */
async function fetchBestMatchPage(supabase, { userId, filters, filterContext, from, to }) {
  const { data: matchRows, error: matchError } = await supabase
    .from('matches')
    .select('job_id')
    .eq('user_id', userId)
    .gte('score', DEFAULT_MIN_SCORE)
    .order('score', { ascending: false })
    .limit(BEST_MATCH_CANDIDATE_LIMIT);

  if (matchError) throw matchError;
  if (!matchRows?.length) return null;

  let candidateIds = matchRows.map((row) => row.job_id);

  if (filterContext.facetJobIds != null) {
    const allowed = new Set(filterContext.facetJobIds);
    candidateIds = candidateIds.filter((id) => allowed.has(id));
  }

  if (!candidateIds.length) {
    return { data: [], total: 0, semantic: true };
  }

  const [{ data: profile }, { data: resumeRows }, chunked] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('resumes').select('*').eq('user_id', userId),
    fetchJobsByIdChunks(supabase, {
      candidateIds,
      filters,
      filterContext: {
        ...filterContext,
        facetJobIds: null, // already applied via candidateIds
      },
    }),
  ]);

  const { rows, semantic } = chunked;
  const resumeList = resumeRows || [];
  const targetProfile = profile || null;

  // LIVE re-score with the eligibility-first engine, then rank by live score.
  const scored = [];
  for (const job of rows) {
    const explanation = scoreJobForUser(job, resumeList, targetProfile);
    if (!explanation || explanation.excluded) continue;
    if ((explanation.score ?? 0) < DEFAULT_MIN_SCORE) continue;
    scored.push({
      ...job,
      match_score: explanation.score,
      match_reasons: explanation.reasons || [],
    });
  }

  scored.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));

  return {
    data: scored.slice(from, to + 1),
    total: scored.length,
    semantic,
  };
}

/**
 * PostgREST/.in() fails or times out with hundreds of UUIDs — fetch in chunks.
 */
async function fetchJobsByIdChunks(supabase, { candidateIds, filters, filterContext }) {
  const chunks = [];
  for (let i = 0; i < candidateIds.length; i += BEST_MATCH_ID_CHUNK) {
    chunks.push(candidateIds.slice(i, i + BEST_MATCH_ID_CHUNK));
  }

  let semantic = true;
  const rows = [];
  let totalCount = 0;

  for (const chunk of chunks) {
    let query = supabase
      .from('jobs')
      .select(jobListSelect(), { count: 'exact' })
      .in('id', chunk);

    query = applyJobFilters(query, filters, filterContext);

    const { data, error, count } = await query;
    if (error) {
      if (!isSemanticSelectError(error)) throw error;

      semantic = false;
      let fallback = supabase
        .from('jobs')
        .select('*, job_sources(name, slug)', { count: 'exact' })
        .in('id', chunk);
      fallback = applyJobFilters(
        fallback,
        { ...filters, jobFamily: filters.jobFamily || '' },
        { ...filterContext, tagSearchJobIds: [] },
      );
      const retry = await fallback;
      if (retry.error) throw retry.error;
      rows.push(...(retry.data || []));
      totalCount += retry.count ?? retry.data?.length ?? 0;
      continue;
    }

    rows.push(...(data || []).map(shapeJobSemantics));
    totalCount += count ?? data?.length ?? 0;
  }

  return { rows, count: totalCount, semantic };
}

async function resolveIntersectedFacetJobIds(supabase, filters) {
  const sets = [];

  if (filters.careerAreas.length) {
    const ids = await resolveJobIdsByCareerAreas(supabase, filters.careerAreas);
    if (ids == null) return null;
    sets.push(ids);
  }

  if (filters.experienceLevel) {
    const ids = await resolveJobIdsByFacetValues(supabase, 'experience_level', [filters.experienceLevel]);
    if (ids == null) return sets.length ? intersectIdSets(sets) : null;
    sets.push(ids);
  }

  if (!sets.length) return null;
  return intersectIdSets(sets);
}

function intersectIdSets(sets) {
  if (!sets.length) return [];
  return sets.reduce((acc, next) => {
    const nextSet = new Set(next);
    return acc.filter((id) => nextSet.has(id));
  });
}

function isSemanticSelectError(error) {
  const message = error?.message || '';
  return (
    message.includes('job_facets') ||
    message.includes('job_tags') ||
    message.includes('schema cache') ||
    message.includes('Could not find')
  );
}