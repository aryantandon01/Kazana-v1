import { getAdminClient } from '../supabase/admin.js';
import { scoreJobForUser, DEFAULT_MIN_SCORE } from './score.js';
import { jobListSelect, shapeJobSemantics } from '../jobs/semantic.js';

const DEFAULT_LOOKBACK_HOURS = 48;
/** When matching a single user (e.g. after resume upload), score a wider active set. */
const USER_LOOKBACK_HOURS = 24 * 90;
const USER_JOB_LIMIT = 800;
const BATCH_SIZE = 100;

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
  const jobCap = limitJobs ?? (userId && !jobId ? USER_JOB_LIMIT : null);
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

  const jobs = await loadCandidateJobs(supabaseAdmin, {
    jobId,
    userId,
    since,
    nowIso,
    jobCap,
    resumes: resumes || [],
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

  const pendingMatches = [];
  const staleRows = []; // existing match rows that no longer qualify
  for (const job of jobs) {
    for (const uid of userIds) {
      const wasExisting = Boolean(existingByUser.get(uid)?.has(job.id));

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
      });
      existingByUser.get(uid)?.add(job.id);
    }
  }

  // Remove existing match rows that no longer qualify (score below threshold
  // or now excluded by the student/role gates). Otherwise they'd linger forever.
  for (let i = 0; i < staleRows.length; i += BATCH_SIZE) {
    const chunk = staleRows.slice(i, i + BATCH_SIZE);
    if (!chunk.length) continue;
    await supabaseAdmin
      .from('matches')
      .delete()
      .in('user_id', chunk.map((r) => r.user_id))
      .in('job_id', chunk.map((r) => r.job_id));
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
      if (source) inserted.push({ ...row, job: source.job });
    }
  }

  if (enqueueNotifications) {
    for (const row of inserted) {
      const userPrefs = prefsMap.get(row.user_id);
      if (userPrefs?.push_enabled === false) continue;

      const { error: queueError } = await supabaseAdmin.from('notification_queue').insert({
        user_id: row.user_id,
        match_id: row.id,
        job_id: row.job_id,
        title: `New match: ${row.job.company_name}`,
        body: `${row.job.title} — score ${Math.round(row.score * 100)}%`,
        payload: {
          type: 'job_match',
          job_id: row.job_id,
          match_id: row.id,
          score: row.score,
        },
      });
      if (!queueError) enqueued += 1;
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

async function loadCandidateJobs(supabaseAdmin, { jobId, userId, since, nowIso, jobCap, resumes }) {
  const activeFilter = `expires_at.is.null,expires_at.gt.${nowIso}`;
  const select = jobListSelect();

  if (jobId) {
    const { data, error } = await supabaseAdmin.from('jobs').select(select).eq('id', jobId);
    if (error) throw new Error(error.message);
    return (data || []).map(shapeJobSemantics);
  }

  if (!userId) {
    let q = supabaseAdmin
      .from('jobs')
      .select(select)
      .or(activeFilter)
      .gte('posted_at', since)
      .order('posted_at', { ascending: false });
    if (jobCap) q = q.limit(jobCap);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []).map(shapeJobSemantics);
  }

  const families = [...new Set(resumes.map((r) => r.job_family).filter(Boolean))];
  const byId = new Map();

  // 1) Jobs in resume job families (most relevant).
  if (families.length) {
    try {
      const familyQuery = supabaseAdmin
        .from('jobs')
        .select(select)
        .or(activeFilter)
        .in('job_family', families)
        .order('posted_at', { ascending: false })
        .limit(Math.min(jobCap || 2000, 2000));
      const { data, error } = await familyQuery;
      if (error) throw new Error(error.message);
      for (const job of data || []) byId.set(job.id, shapeJobSemantics(job));
    } catch (err) {
      // Best-effort: a pool timeout must not abort the entire refresh.
      console.warn('loadCandidateJobs family query degraded', err);
    }
  }

  // 2) Recent jobs to catch misclassified postings (title heuristics still apply).
  const remaining = Math.max(0, (jobCap || USER_JOB_LIMIT) - byId.size);
  if (remaining > 0) {
    try {
      const recentQuery = supabaseAdmin
        .from('jobs')
        .select(select)
        .or(activeFilter)
        .gte('posted_at', since)
        .order('posted_at', { ascending: false })
        .limit(remaining);
      const { data, error } = await recentQuery;
      if (error) throw new Error(error.message);
      for (const job of data || []) {
        if (!byId.has(job.id)) byId.set(job.id, shapeJobSemantics(job));
      }
    } catch (err) {
      console.warn('loadCandidateJobs recent query degraded', err);
    }
  }

  return [...byId.values()];
}
