/** @typedef {'incremental' | 'full'} IngestMode */

/**
 * @param {unknown} result
 * @returns {{ jobs: import('./types.js').RawJob[], allExternalIds: string[] }}
 */
export function normalizeFetchResult(result) {
  if (Array.isArray(result)) {
    return {
      jobs: result,
      allExternalIds: result.map((job) => String(job.external_id)),
    };
  }

  return {
    jobs: result.jobs || [],
    allExternalIds: result.allExternalIds || (result.jobs || []).map((job) => String(job.external_id)),
  };
}

/**
 * @param {string | null | undefined} sinceIso
 * @returns {Date | null}
 */
export function sinceWithOverlap(sinceIso, overlapMs = 5 * 60 * 1000) {
  if (!sinceIso) return null;
  return new Date(new Date(sinceIso).getTime() - overlapMs);
}

/**
 * @param {import('./types.js').RawJob} raw
 * @param {Set<string>} existingIds
 * @param {Date | null} since
 * @param {IngestMode} mode
 */
export function shouldUpsertJob(raw, existingIds, since, mode) {
  if (mode === 'full') return true;

  const externalId = String(raw.external_id);
  if (!existingIds.has(externalId)) return true;
  if (!since) return true;

  const timestamp = raw.updated_at || raw.posted_at;
  if (!timestamp) return false;

  return new Date(timestamp) > since;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} sourceId
 * @returns {Promise<{ ids: Set<string>, byExternalId: Map<string, object> }>}
 */
export async function loadExistingJobs(supabase, sourceId) {
  const ids = new Set();
  /** @type {Map<string, object>} */
  const byExternalId = new Map();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, external_id, discovered_at, last_updated_at, job_version, content_hash, expires_at')
      .eq('source_id', sourceId)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed to load existing jobs: ${error.message}`);
    if (!data?.length) break;

    for (const row of data) {
      const externalId = String(row.external_id);
      ids.add(externalId);
      byExternalId.set(externalId, row);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return { ids, byExternalId };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} sourceId
 */
export async function loadExistingJobIds(supabase, sourceId) {
  const { ids } = await loadExistingJobs(supabase, sourceId);
  return ids;
}

/**
 * Soft-expire jobs that disappeared from the source feed, and remove their matches
 * so expired JDs no longer surface on the Matches page.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} sourceId
 * @param {Set<string>} activeExternalIds
 * @returns {Promise<{ expired: number, matchesRemoved: number }>}
 */
export async function expireRemovedJobs(supabase, sourceId, activeExternalIds) {
  const pageSize = 500;
  let from = 0;
  let expired = 0;
  let matchesRemoved = 0;
  const now = new Date().toISOString();

  while (true) {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, external_id')
      .eq('source_id', sourceId)
      .is('expires_at', null)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed to load jobs for expiry check: ${error.message}`);
    if (!data?.length) break;

    const toExpire = data.filter((row) => !activeExternalIds.has(String(row.external_id)));
    if (toExpire.length) {
      const ids = toExpire.map((row) => row.id);

      const { error: matchError, count: deletedMatches } = await supabase
        .from('matches')
        .delete({ count: 'exact' })
        .in('job_id', ids);

      if (matchError) {
        throw new Error(`Failed to delete matches for expired jobs: ${matchError.message}`);
      }
      matchesRemoved += deletedMatches || 0;

      const { error: updateError } = await supabase
        .from('jobs')
        .update({ expires_at: now })
        .in('id', ids);

      if (updateError) throw new Error(`Failed to expire removed jobs: ${updateError.message}`);
      expired += toExpire.length;
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return { expired, matchesRemoved };
}
