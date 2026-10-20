#!/usr/bin/env node
import '../../lib/loadEnv.js';
import { runIngestion } from '../ingestion/pipeline.js';
import { runIngestCycle } from '../../lib/worker/run.js';
import { supabaseAdmin } from '../ingestion/supabase.js';
import {
  acquireWorkerLock,
  releaseWorkerLock,
  startLockHeartbeat,
  workerOwner,
} from '../../lib/worker/lock.js';

/**
 * Continuous ingestion worker.
 *
 * The full source list is swept pass after pass; `last_fetched_at` drives the
 * incremental window per source. This is deliberately NOT a 5-minute cron: a
 * 100+ source pass takes tens of minutes. The 5-minute cadence belongs to
 * `scripts/worker/pulse.js` (match + notify).
 */

const DEFAULT_CONCURRENCY = 8;
const DEFAULT_COOLDOWN_MINUTES = 5;

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parseArgs(argv) {
  const options = { once: false, full: false, help: false };

  for (const arg of argv) {
    if (arg === '--once') options.once = true;
    else if (arg === '--full') options.full = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function usage() {
  console.log(`
Kazana ingestion worker

Usage:
  node scripts/worker/ingest.js            Sweep sources continuously
  node scripts/worker/ingest.js --once     One sweep, then exit (external cron)
  node scripts/worker/ingest.js --full     Re-fetch every job (refresh descriptions)

Environment:
  WORKER_INGEST_CONCURRENCY         Sources fetched in parallel (default ${DEFAULT_CONCURRENCY})
  WORKER_INGEST_COOLDOWN_MINUTES    Pause between sweeps (default ${DEFAULT_COOLDOWN_MINUTES})

A full pass over ~114 sources is slow: measured source work is ~630 min, so
expect ~80 minutes at concurrency 8 (~40 at the cap of 16). Raise
WORKER_INGEST_CONCURRENCY to shorten passes, and watch ingestion_runs for
provider rate limits. Delivery latency is handled by the separate pulse worker.
`);
}

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  usage();
  process.exit(0);
}

const concurrency = positiveInt(process.env.WORKER_INGEST_CONCURRENCY, DEFAULT_CONCURRENCY);
const cooldownMs =
  positiveInt(process.env.WORKER_INGEST_COOLDOWN_MINUTES, DEFAULT_COOLDOWN_MINUTES) * 60_000;
const mode = options.full ? 'full' : 'incremental';

let stopping = false;
let wakeFromSleep = null;

/** Sleep that can be interrupted by SIGTERM so deploys do not wait out a cooldown. */
function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      wakeFromSleep = null;
      resolve();
    }, ms);
    wakeFromSleep = () => {
      clearTimeout(timer);
      wakeFromSleep = null;
      resolve();
    };
  });
}

function requestShutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[worker] ${signal}_received — finishing the current source then exiting`);
  if (wakeFromSleep) wakeFromSleep();
}

process.on('SIGTERM', () => requestShutdown('SIGTERM'));
process.on('SIGINT', () => requestShutdown('SIGINT'));

console.log(
  '[worker] ingest starting',
  JSON.stringify({ mode, concurrency, cooldown_minutes: cooldownMs / 60_000, once: options.once }),
);

// Skip-if-running guard: if another ingest run still holds the lease, this run
// is a no-op. The heartbeat keeps the lease alive; a crashed run expires.
const LOCK_NAME = 'ingest';
const LOCK_TTL_SECONDS = 900;
const lockOwner = workerOwner(LOCK_NAME);

const lockAcquired = await acquireWorkerLock(supabaseAdmin, LOCK_NAME, {
  ttlSeconds: LOCK_TTL_SECONDS,
  owner: lockOwner,
});

if (!lockAcquired) {
  console.log('[worker] ingest skipped — previous run still in progress');
  process.exit(0);
}

const stopHeartbeat = startLockHeartbeat(supabaseAdmin, LOCK_NAME, {
  ttlSeconds: LOCK_TTL_SECONDS,
  owner: lockOwner,
});

let lastReport = null;

try {
  do {
    lastReport = await runIngestCycle({
      ingest: () => runIngestion(undefined, { mode, concurrency }),
    });

    if (options.once || stopping) break;

    console.log(`[worker] ingest cooldown ${cooldownMs / 60_000}m`);
    await sleep(cooldownMs);
  } while (!stopping);

  if (options.once) {
    process.exitCode = lastReport?.ok ? 0 : 1;
  }
} finally {
  stopHeartbeat();
  await releaseWorkerLock(supabaseAdmin, LOCK_NAME, lockOwner).catch(() => {});
}

console.log('[worker] ingest stopped');
