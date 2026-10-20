/**
 * Enqueue job-match notifications for newly created matches.
 *
 * Enqueue time is where *eligibility* is enforced (opt-in, threshold, duplicate,
 * daily limit) because it happens minutes before delivery — cheap, and it stops
 * the queue from filling with rows that will just be skipped. The DB unique
 * index `(user_id, job_id, channel)` is the final, concurrency-safe guard: even
 * if two workers race, only one row per (user, job, channel) can ever exist.
 */

import { NOTIFICATION_CHANNELS } from './config.js';
import { shouldNotify } from './eligibility.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Match rows are cumulative (a job stays a match until it expires or stops
 * qualifying), but pushes should only announce genuinely fresh opportunities.
 * Without this, the first widened matching run would "announce" the backlog.
 */
const JOB_FRESHNESS_MAX_AGE_DAYS = 7;
/** Fallback when the employer posting date is unknown (4,992 jobs today). */
const DISCOVERED_FALLBACK_HOURS = 48;

const ACTIVE_STATUSES = ['pending', 'processing', 'sent'];

function parseTime(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function isJobFresh(job, now, maxAgeDays) {
  const posted = parseTime(job?.posted_at);
  if (posted != null) {
    return now.getTime() - posted <= maxAgeDays * DAY_MS;
  }
  const discovered = parseTime(job?.discovered_at);
  if (discovered != null) {
    return now.getTime() - discovered <= DISCOVERED_FALLBACK_HOURS * HOUR_MS;
  }
  // Unknown dates: fail open rather than silently dropping notifications.
  return true;
}

/**
 * Baseline of already-queued/sent notifications per `${user_id}:${channel}`
 * in the last 24h, so the daily limit is respected across worker runs.
 */
async function loadRecentCounts(supabaseAdmin, userIds, now) {
  const counts = new Map();
  if (!userIds.length) return counts;

  const since = new Date(now.getTime() - DAY_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from('notification_queue')
    .select('user_id, channel')
    .in('user_id', userIds)
    .in('status', ACTIVE_STATUSES)
    .gte('created_at', since);

  if (error) return counts; // fail open on counts; unique index still prevents dupes

  for (const row of data || []) {
    const key = `${row.user_id}:${row.channel || 'push'}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

/**
 * @param {object} supabaseAdmin
 * @param {Array<{ id: string, user_id: string, job_id: string, score: number, resume_id?: string|null, job?: object }>} matches
 *        newly created matches (existing rows must NOT be passed here)
 * @param {Map<string, object>} prefsMap
 * @param {{ now?: Date, channels?: string[], maxJobAgeDays?: number }} [options]
 * @returns {Promise<{ enqueued: number, skipped: number, reasons: Record<string, number> }>}
 */
export async function enqueueMatchNotifications(supabaseAdmin, matches, prefsMap, options = {}) {
  const now = options.now || new Date();
  const channels = options.channels || NOTIFICATION_CHANNELS;
  const reasons = {};
  let enqueued = 0;
  let skipped = 0;

  const userIds = [...new Set(matches.map((m) => m.user_id))];
  const recentCounts = await loadRecentCounts(supabaseAdmin, userIds, now);
  const maxJobAgeDays = options.maxJobAgeDays ?? JOB_FRESHNESS_MAX_AGE_DAYS;

  for (const match of matches) {
    const prefs = prefsMap.get(match.user_id) || null;
    const fresh = isJobFresh(match.job, now, maxJobAgeDays);

    for (const channel of channels) {
      if (!fresh) {
        skipped += 1;
        reasons.job_stale = (reasons.job_stale || 0) + 1;
        continue;
      }

      const bucketKey = `${match.user_id}:${channel}`;
      const decision = shouldNotify({
        channel,
        matchScore: match.score,
        prefs,
        // Cross-run duplicates are prevented by the unique index below.
        alreadyNotified: false,
        sentTodayCount: recentCounts.get(bucketKey) || 0,
      });

      if (!decision.notify) {
        skipped += 1;
        reasons[decision.reason] = (reasons[decision.reason] || 0) + 1;
        continue;
      }

      const job = match.job || {};
      const payload = {
        type: 'job_match',
        channel,
        job_id: match.job_id,
        match_id: match.id,
        resume_id: match.resume_id || null,
        score: match.score,
        job_title: job.title || null,
        company_name: job.company_name || null,
      };

      // ignoreDuplicates + the unique index make this an idempotent enqueue.
      const { error } = await supabaseAdmin.from('notification_queue').upsert(
        {
          user_id: match.user_id,
          match_id: match.id,
          job_id: match.job_id,
          resume_id: match.resume_id || null,
          channel,
          type: 'job_match',
          match_score: match.score,
          title: `New match: ${job.company_name || 'Kazana'}`,
          body: `${job.title || 'A new role'} — score ${Math.round(match.score * 100)}%`,
          payload,
          status: 'pending',
          scheduled_for: now.toISOString(),
        },
        { onConflict: 'user_id,job_id,channel', ignoreDuplicates: true },
      );

      if (error) {
        skipped += 1;
        reasons.enqueue_error = (reasons.enqueue_error || 0) + 1;
        continue;
      }

      enqueued += 1;
      recentCounts.set(bucketKey, (recentCounts.get(bucketKey) || 0) + 1);
    }
  }

  return { enqueued, skipped, reasons };
}
