#!/usr/bin/env node
import '../../lib/loadEnv.js';
import { runMatching } from '../../lib/matching/run.js';
import { runNotifications } from '../../lib/notifications/dispatch.js';
import { runPulse } from '../../lib/worker/run.js';

/**
 * Delivery pulse: match every user, then drain the notification queue.
 *
 * This is the loop that honors the five-minute requirement — a job ingested
 * moments ago is scored, enqueued and dispatched in the same pulse. Runs
 * sequentially: a slow pulse delays the next one but never overlaps it, so two
 * pulses can never double-enqueue.
 */

const DEFAULT_INTERVAL_MINUTES = 5;
/**
 * 2 h keeps a pulse inside `runMatching`'s 2,000-candidate cap at the observed
 * ~530 new jobs/hour, while still covering a missed pulse or a short restart.
 * Raising this without raising the cap silently skips the oldest jobs.
 */
const DEFAULT_LOOKBACK_HOURS = 2;
const DEFAULT_NOTIFY_LIMIT = 200;

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parseArgs(argv) {
  const options = { once: false, help: false };

  for (const arg of argv) {
    if (arg === '--once') options.once = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function usage() {
  console.log(`
Kazana delivery pulse

Usage:
  node scripts/worker/pulse.js           Run every ${DEFAULT_INTERVAL_MINUTES} minutes
  node scripts/worker/pulse.js --once    One match → notify, then exit

Environment:
  WORKER_PULSE_MINUTES              Cadence for match → notify (default ${DEFAULT_INTERVAL_MINUTES})
  WORKER_MATCH_LOOKBACK_HOURS       Jobs re-scored per pulse, by discovered_at (default ${DEFAULT_LOOKBACK_HOURS})
  WORKER_NOTIFY_LIMIT               Queue rows drained per pulse (default ${DEFAULT_NOTIFY_LIMIT})
`);
}

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  usage();
  process.exit(0);
}

const intervalMs = positiveInt(process.env.WORKER_PULSE_MINUTES, DEFAULT_INTERVAL_MINUTES) * 60_000;
const lookbackHours = positiveInt(process.env.WORKER_MATCH_LOOKBACK_HOURS, DEFAULT_LOOKBACK_HOURS);
const notifyLimit = positiveInt(process.env.WORKER_NOTIFY_LIMIT, DEFAULT_NOTIFY_LIMIT);

let stopping = false;
let wakeFromSleep = null;

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
  console.log(`[worker] ${signal}_received — finishing the current pulse then exiting`);
  if (wakeFromSleep) wakeFromSleep();
}

process.on('SIGTERM', () => requestShutdown('SIGTERM'));
process.on('SIGINT', () => requestShutdown('SIGINT'));

console.log(
  '[worker] pulse starting',
  JSON.stringify({
    interval_minutes: intervalMs / 60_000,
    lookback_hours: lookbackHours,
    notify_limit: notifyLimit,
    once: options.once,
  }),
);

let lastResult = null;

do {
  lastResult = await runPulse({
    match: () => runMatching({ sinceHours: lookbackHours }),
    notify: () => runNotifications({ limit: notifyLimit }),
  });

  if (options.once || stopping) break;

  // Subtract the pulse duration so the cadence stays 5 minutes wall-clock while
  // still never overlapping two pulses.
  const waitMs = Math.max(0, intervalMs - (lastResult.duration_ms || 0));
  console.log(`[worker] pulse next in ${Math.round(waitMs / 1000)}s`);
  await sleep(waitMs);
} while (!stopping);

if (options.once) {
  process.exitCode = lastResult?.ok ? 0 : 1;
}

console.log('[worker] pulse stopped');
