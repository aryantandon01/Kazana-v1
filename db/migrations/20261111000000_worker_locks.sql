-- Worker locks — skip-if-running guard for scheduled background workers.
--
-- A worker acquires a named, leased lock before doing work. If another run
-- still holds it, the caller skips (no-op) instead of overlapping. The lease
-- expires, so a crashed run is self-healing and never blocks the worker forever.
--
-- Used by scripts/worker/{ingest,pulse}.js (via lib/worker/lock.js) when they
-- run in `--once` mode from GitHub Actions (cron every 5 minutes).
--
-- Apply: npm run db:migrate (with DATABASE_URL) or Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS worker_locks (
  name TEXT PRIMARY KEY,
  locked_until TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  owner TEXT NOT NULL DEFAULT 'unknown',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE worker_locks IS
  'Leased locks for background workers. Acquire with a TTL; overlapping runs skip. Expiry makes crashed runs self-healing.';

-- Service-role only: no client policies (RLS enabled with zero policies blocks
-- anon/authenticated; the service role bypasses RLS).
ALTER TABLE worker_locks ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- worker_lock_acquire — atomically take or extend a lease.
-- Returns true when this caller may run; false when another owner holds it.
-- Re-acquiring with the SAME owner extends the lease (heartbeat).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.worker_lock_acquire(
  p_name TEXT,
  p_ttl_seconds INTEGER,
  p_owner TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acquired BOOLEAN := false;
  v_ttl INTEGER := GREATEST(COALESCE(p_ttl_seconds, 900), 30);
BEGIN
  INSERT INTO worker_locks (name, locked_until, locked_at, owner, updated_at)
  VALUES (p_name, now() + make_interval(secs => v_ttl), now(), p_owner, now())
  ON CONFLICT (name) DO UPDATE
    SET locked_until = now() + make_interval(secs => v_ttl),
        locked_at = now(),
        owner = p_owner,
        updated_at = now()
    WHERE worker_locks.locked_until < now()
       OR worker_locks.owner = p_owner
  RETURNING true INTO v_acquired;

  RETURN COALESCE(v_acquired, false);
END;
$$;

-- ---------------------------------------------------------------------------
-- worker_lock_release — release only if this caller still owns the lease.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.worker_lock_release(p_name TEXT, p_owner TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released BOOLEAN := false;
BEGIN
  UPDATE worker_locks
     SET locked_until = now(), updated_at = now()
   WHERE name = p_name AND owner = p_owner
  RETURNING true INTO v_released;

  RETURN COALESCE(v_released, false);
END;
$$;

-- ---------------------------------------------------------------------------
-- Security: callable by service_role only (the workers use the service key).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.worker_lock_acquire(text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_lock_acquire(text, integer, text) TO service_role;

REVOKE ALL ON FUNCTION public.worker_lock_release(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_lock_release(text, text) TO service_role;
