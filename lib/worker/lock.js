/**
 * Worker locks — skip-if-running guard for scheduled background workers.
 *
 * A worker acquires a named, leased lock before doing work. If another run
 * still holds it, the caller skips (no-op) instead of overlapping. A heartbeat
 * extends the lease while the run is alive, so a healthy run never loses its
 * lock; if the process crashes, the lease expires and the next run proceeds.
 *
 * Backed by public.worker_lock_acquire / worker_lock_release
 * (db/migrations/20261111000000_worker_locks.sql), callable by service_role only.
 */

const DEFAULT_TTL_SECONDS = 900; // 15 min
const DEFAULT_HEARTBEAT_MS = 60_000;

/**
 * A unique owner id per process/run. Reusing the same owner is what lets the
 * heartbeat extend (rather than contend for) the lease.
 */
export function workerOwner(label = 'worker') {
  const run = process.env.GITHUB_RUN_ID
    ? `gha-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`
    : `pid-${process.pid}`;
  return `${label}:${run}`;
}

/**
 * Try to acquire (or extend) a worker lease.
 *
 * Fail-open: if the lock RPC is unavailable (migration not applied / RPC error)
 * we log and return true so background work is never silently stopped.
 *
 * @param {object} supabase - service-role Supabase client
 * @param {string} name - lock name, e.g. 'ingest' | 'pulse'
 * @param {{ ttlSeconds?: number, owner?: string }} [options]
 * @returns {Promise<boolean>} true when this caller may run
 */
export async function acquireWorkerLock(supabase, name, { ttlSeconds = DEFAULT_TTL_SECONDS, owner } = {}) {
  if (!supabase) return true;

  const { data, error } = await supabase.rpc('worker_lock_acquire', {
    p_name: name,
    p_ttl_seconds: ttlSeconds,
    p_owner: owner || workerOwner(name),
  });

  if (error) {
    console.warn(`[worker] lock acquire "${name}" failed (${error.message}) — continuing without lock`);
    return true;
  }

  return Boolean(data);
}

/**
 * Release a worker lease (only if this owner still holds it).
 * @returns {Promise<boolean>}
 */
export async function releaseWorkerLock(supabase, name, owner) {
  if (!supabase || !owner) return false;

  const { data, error } = await supabase.rpc('worker_lock_release', {
    p_name: name,
    p_owner: owner,
  });

  if (error) {
    console.warn(`[worker] lock release "${name}" failed (${error.message})`);
    return false;
  }

  return Boolean(data);
}

/**
 * Keep a lease alive for the lifetime of a long-running worker. Returns a stop
 * function; always call it (e.g. in a `finally`) before releasing the lock.
 *
 * @param {object} supabase
 * @param {string} name
 * @param {{ ttlSeconds?: number, owner?: string, intervalMs?: number }} [options]
 * @returns {() => void}
 */
export function startLockHeartbeat(
  supabase,
  name,
  { ttlSeconds = DEFAULT_TTL_SECONDS, owner, intervalMs = DEFAULT_HEARTBEAT_MS } = {},
) {
  if (!supabase) return () => {};

  const timer = setInterval(() => {
    acquireWorkerLock(supabase, name, { ttlSeconds, owner }).catch((err) => {
      console.warn(`[worker] lock heartbeat "${name}" failed: ${err?.message || err}`);
    });
  }, intervalMs);

  // Don't keep the event loop alive solely for the heartbeat.
  if (typeof timer.unref === 'function') timer.unref();

  return () => clearInterval(timer);
}
