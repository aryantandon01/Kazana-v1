import { getAdminClient } from '../supabase/admin.js';
import { scoreJobForUser, DEFAULT_MIN_SCORE } from './score.js';
import { jobListSelect, shapeJobSemantics } from '../jobs/semantic.js';
import { enqueueMatchNotifications } from '../notifications/enqueue.js';

const DEFAULT_LOOKBACK_HOURS = 48;
/** When matching a single user (e.g. after resume upload), score a wider active set. */
const USER_LOOKBACK_HOURS = 24 * 90;
const USER_JOB_LIMIT = 800;
/** Bound the hourly global run. The window is `discovered_at`, so this is a cost cap, not a freshness rule. */
const DEFAULT_JOB_LIMIT = 2000;
const BATCH_SIZE = 100;
/** `.or(and(...))` predicates go in the URL; keep chunks well under proxy limits. */
const STALE_DELETE_BATCH = 40;
const FETCH_BY_ID_CHUNK = 100;

/**
 * Score jobs against resumes and persist rows in `matches`.
 * @param {{ jobId?: string, userId?: string, sinceHours?: number, limitJobs?: number, enqueueNotifications?: boolean }} [options]
 */
export async function runMatching({
  jobId,
  userId,
  sinceHours,
  limitJobs,
  enqueueNotifications = true,
} = {}) {
  const supabaseAdmin = getAdminClient();
  const lookbackHours =
    sinceHours ?? (userId && !jobId ? USER_LOOKBACK_HOURS : DEFAULT_LOOKBACK_HOURS);
  const jobCap = limitJobs ?? (userId && !jobId ? USER_JOB_LIMIT : DEFAULT_JOB_LIMIT);
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  let resumesQuery = supabaseAdmin.from('resumes').select('*');
  if (userId) {
    resumesQuery = resumesQuery.eq('user_id', userId);
  }

  const { data: resumes, error: resumesError } = await resumesQuery;
  if (resumesError) throw new Error(resumesError.message);

  const resumesByUser = new Map();
  for (const r of resumes || []) {
    if (!resumesByUser.has(r.user_id)) resumesByUser.set(r.user_id, []);
    resumesByUser.get(r.user_id).push(r);
  }

  const userIds = [...resumesByUser.keys()];
  if (!userIds.length) {
    return { matched: 0, enqueued: 0, jobs: 0, users: 0, lookback_hours: lookbackHours };
  }

  /** @type {Map<string, Set<string>>} */
  const existingByUser = new Map();
  for (const uid of userIds) {
    let existingQuery = supabaseAdmin.from('matches').select('job_id').eq('user_id', uid);
    if (jobId) {
      existingQuery = existingQuery.eq('job_id', jobId);
    }
    const { data: existing } = await existingQuery;
    existingByUser.set(uid, new Set((existing || []).map((row) => row.job_id)));
  }

  // Always re-score jobs that already have match rows, even after they scroll
  // out of the discovery window. Otherwise rows the live engine no longer
  // accepts linger forever and Best Match keeps surfacing them.
  const previousJobIds = [
    ...new Set([...existingByUser.values()].flatMap((ids) => [...ids])),
  ];

  const jobs = await loadCandidateJobs(supabaseAdmin, {
    jobId,
    userId,
    since,
    nowIso,
    jobCap,
    resumes: resumes || [],
    previousJobIds,
  });

  if (!jobs.length) {
    return { matched: 0, enqueued: 0, jobs: 0, users: userIds.length, lookback_hours: lookbackHours };
  }

  const { data: profiles } = await supabaseAdmin
    .from('user_profiles')
    .select('*')
    .in('user_id', userIds);

  const { data: prefs } = await supabaseAdmin
    .from('notification_preferences')
    .select('*')
    .in('user_id', userIds);

  const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
  const prefsMap = new Map((prefs || []).map((p) => [p.user_id, p]));

  const pendingMatches = [];
  const staleRows = []; // existing match rows that no longer qualify
  for (const job of jobs) {
    for (const uid of userIds) {
      const wasExisting = Boolean(existingByUser.get(uid)?.has(job.id));

      // Previously-matched jobs are re-scored even if they have since expired;
      // expired postings must lose their match rows.
      const expiresAt = job.expires_at ? new Date(job.expires_at).getTime() : null;
      if (expiresAt != null && expiresAt <= new Date(nowIso).getTime()) {
        if (wasExisting) staleRows.push({ user_id: uid, job_id: job.id });
        continue;
      }

      const userResumes = resumesByUser.get(uid);
      const profile = profileMap.get(uid) || null;
      const explanation = scoreJobForUser(job, userResumes, profile);
      const { score } = explanation;
      const reasons =
        explanation.reasons?.length > 0
          ? explanation.reasons
          : explanation.recommendation_reasons?.length > 0
            ? explanation.recommendation_reasons
            : score >= DEFAULT_MIN_SCORE
              ? ['profile_fit']
              : [];

      // Always recompute scores so persisted rows reflect the live model —
      // matching weights/signals evolve and old rows must be re-scored.
      if (explanation.excluded || score < DEFAULT_MIN_SCORE || reasons.length === 0) {
        if (wasExisting) staleRows.push({ user_id: uid, job_id: job.id });
        continue;
      }

      pendingMatches.push({
        user_id: uid,
        job_id: job.id,
        score,
        reasons,
        job,
        // Only *newly created* matches are ever notified — existing rows are
        // re-scored every run and must not re-notify (idempotency).
        is_new: !wasExisting,
        resume_id: explanation.resume_id || null,
      });
      existingByUser.get(uid)?.add(job.id);
    }
  }

  // Remove existing match rows that no longer qualify (score below threshold
  // or now excluded by the student/role gates). Otherwise they'd linger forever.
  for (let i = 0; i < staleRows.length; i += STALE_DELETE_BATCH) {
    const chunk = staleRows.slice(i, i + STALE_DELETE_BATCH);
    if (!chunk.length) continue;
    // Must match the (user_id, job_id) *pair*: chaining `.in()` on both columns
    // would delete the cross-product across users.
    const predicate = chunk
      .map((row) => `and(user_id.eq.${row.user_id},job_id.eq.${row.job_id})`)
      .join(',');
    const { error: deleteError } = await supabaseAdmin.from('matches').delete().or(predicate);
    if (deleteError) console.error('runMatching stale delete', deleteError.message);
  }

  let matched = 0;
  let enqueued = 0;
  const inserted = [];

  for (let i = 0; i < pendingMatches.length; i += BATCH_SIZE) {
    const chunk = pendingMatches.slice(i, i + BATCH_SIZE);
    // Upsert (not insert) so existing match rows get re-scored whenever the
    // matching weights/signals change — otherwise stale high scores persist forever.
    const { data: rows, error: matchError } = await supabaseAdmin
      .from('matches')
      .upsert(
        chunk.map(({ user_id, job_id, score, reasons }) => ({
          user_id,
          job_id,
          score,
          reasons,
        })),
        { onConflict: 'user_id,job_id' },
      )
      .select('id, user_id, job_id, score');

    if (matchError) {
      console.error('runMatching batch upsert', matchError.message);
      continue;
    }

    matched += rows?.length || 0;
    for (const row of rows || []) {
      const source = chunk.find((c) => c.user_id === row.user_id && c.job_id === row.job_id);
      if (source) {
        inserted.push({ ...row, job: source.job, is_new: source.is_new, resume_id: source.resume_id });
      }
    }
  }

  if (enqueueNotifications && inserted.length) {
    // Only new matches are notified; per-channel eligibility (opt-in, match
    // threshold, duplicate, daily limit) is enforced inside the enqueuer, and
    // the `notification_queue(user_id, job_id, channel)` unique index is the
    // concurrency-safe final guard against duplicate sends.
    const notifiable = inserted.filter((row) => row.is_new);
    if (notifiable.length) {
      const { enqueued: queued } = await enqueueMatchNotifications(supabaseAdmin, notifiable, prefsMap, {
        now: new Date(nowIso),
      });
      enqueued = queued;
    }
  }

  return {
    matched,
    enqueued,
    jobs: jobs.length,
    users: userIds.length,
    lookback_hours: lookbackHours,
  };
}

async function loadCandidateJobs(
  supabaseAdmin,
  { jobId, userId, since, nowIso, jobCap, resumes, previousJobIds = [] },
) {
  const activeFilter = `expires_at.is.null,expires_at.gt.${nowIso}`;
  const select = jobListSelect();

  if (jobId) {
    const { data, error } = await supabaseAdmin.from('jobs').select(select).eq('id', jobId);
    if (error) throw new Error(error.message);
    return (data || []).map(shapeJobSemantics);
  }

  if (!userId) {
    // Select by *ingestion* time, not employer post time: freshly discovered
    // jobs often carry an old (or null) posted_at and would otherwise never be
    // scored. The lookback is continuous via the hourly cron.
    const windowIds = await selectJobIdsPaged(
      () =>
        supabaseAdmin
          .from('jobs')
          .select('id')
          .or(activeFilter)
          .gte('discovered_at', since)
          .order('discovered_at', { ascending: false })
          .order('id', { ascending: true }),
      jobCap || DEFAULT_JOB_LIMIT,
    );
    // Existing match rows are re-scored even when they fall outside the window.
    const orderedIds = [...new Set([...windowIds, ...previousJobIds])];
    // Two-step fetch: the semantic select joins facets/tags and a wide date
    // window can exceed the statement timeout in one shot.
    return fetchJobsByIds(supabaseAdmin, orderedIds, select);
  }

  const families = [...new Set(resumes.map((r) => r.job_family).filter(Boolean))];
  const orderedIds = [];
  const seen = new Set();
  const addIds = (ids) => {
    for (const id of ids || []) {
      if (seen.has(id)) continue;
      seen.add(id);
      orderedIds.push(id);
    }
  };

  // 1) Jobs in resume job families (most relevant).
  if (families.length) {
    try {
      const familyCap = Math.min(jobCap || 2000, 2000);
      const ids = await selectJobIdsPaged(
        () =>
          supabaseAdmin
            .from('jobs')
            .select('id')
            .or(activeFilter)
            .in('job_family', families)
            .order('discovered_at', { ascending: false })
            .order('id', { ascending: true }),
        familyCap,
      );
      addIds(ids);
    } catch (err) {
      // Best-effort: a pool timeout must not abort the entire refresh.
      console.warn('loadCandidateJobs family query degraded', err);
    }
  }

  // 2) Recent jobs to catch misclassified postings (title heuristics still apply).
  const remaining = Math.max(0, (jobCap || USER_JOB_LIMIT) - orderedIds.length);
  if (remaining > 0) {
    try {
      const ids = await selectJobIdsPaged(
        () =>
          supabaseAdmin
            .from('jobs')
            .select('id')
            .or(activeFilter)
            .gte('discovered_at', since)
            .order('discovered_at', { ascending: false })
            .order('id', { ascending: true }),
        remaining,
      );
      addIds(ids);
    } catch (err) {
      console.warn('loadCandidateJobs recent query degraded', err);
    }
  }

  // 3) Jobs with existing match rows: re-score them so stale matches are
  // removed even after the job leaves the discovery window (or expires).
  addIds(previousJobIds);

  return fetchJobsByIds(supabaseAdmin, orderedIds, select);
}

/**
 * PostgREST caps a single response at 1000 rows, so a 2000-job cap must be
 * paginated. The `id` tiebreak keeps page boundaries stable.
 */
async function selectJobIdsPaged(buildQuery, cap) {
  const pageSize = 1000;
  const ids = [];
  while (ids.length < cap) {
    const size = Math.min(pageSize, cap - ids.length);
    const { data, error } = await buildQuery().range(ids.length, ids.length + size - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) ids.push(row.id);
    if (data.length < size) break;
  }
  return ids;
}

/** Hydrate semantic job rows in chunks, preserving the id order. */
async function fetchJobsByIds(supabaseAdmin, ids, select) {
  if (!ids.length) return [];
  const byId = new Map();
  for (let i = 0; i < ids.length; i += FETCH_BY_ID_CHUNK) {
    const chunk = ids.slice(i, i + FETCH_BY_ID_CHUNK);
    const { data, error } = await supabaseAdmin.from('jobs').select(select).in('id', chunk);
    if (error) throw new Error(error.message);
    for (const job of data || []) byId.set(job.id, shapeJobSemantics(job));
  }
  return ids.map((id) => byId.get(id)).filter(Boolean);
}
