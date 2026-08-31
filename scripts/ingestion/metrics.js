/**
 * Daily ingest metrics: one JSON file per calendar day (local timezone).
 * Path: logs/ingest-metrics/YYYY-MM-DD.json
 *
 * Date key is always the local calendar day of `startedAt` — never `finishedAt`.
 * If a run starts on day D and finishes after local midnight, it still appends
 * to D's file (not the next day's).
 *
 * Sessions store session-level totals only (no per-source breakdown).
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import {
  emptyLlmUsageTotals,
  mergeLlmUsageTotals,
  PRICING_AS_OF,
} from './extraction/llm/cost.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const METRICS_DIR = join(__dirname, '../../logs/ingest-metrics');

/**
 * @returns {string} YYYY-MM-DD in local timezone
 */
export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function metricsPath(dateKey = localDateKey()) {
  return join(METRICS_DIR, `${dateKey}.json`);
}

/**
 * @param {string} [dateKey]
 */
export function loadDailyMetrics(dateKey = localDateKey()) {
  const path = metricsPath(dateKey);
  if (!existsSync(path)) {
    return {
      date: dateKey,
      timezone_offset_minutes: new Date().getTimezoneOffset(),
      sessions: [],
      day_totals: emptyTotals(),
    };
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {
      date: dateKey,
      timezone_offset_minutes: new Date().getTimezoneOffset(),
      sessions: [],
      day_totals: emptyTotals(),
    };
  }
}

function emptyTotals() {
  return {
    sessions: 0,
    sources: 0,
    sources_failed: 0,
    jobs_listed: 0,
    jobs_upserted: 0,
    jobs_skipped: 0,
    jobs_failed: 0,
    jobs_expired: 0,
    jobs_versioned: 0,
    extracted: 0,
    llm_calls: 0,
    llm: emptyLlmUsageTotals(),
    estimated_cost_usd: 0,
    balance_spent_usd: 0,
  };
}

/**
 * @param {object[]} sourceResults from runIngestion
 * @param {{
 *   mode: string,
 *   sourceFilter?: string|null,
 *   startedAt: string,
 *   finishedAt?: string,
 *   deepseekBalanceBefore?: object|null,
 *   deepseekBalanceAfter?: object|null,
 * }} meta
 */
export function appendIngestSession(sourceResults, meta) {
  if (!meta?.startedAt) {
    throw new Error('appendIngestSession requires meta.startedAt (metrics file is keyed by start day)');
  }
  // Intentional: use start time only so overnight runs stay on the start day's file.
  const dateKey = localDateKey(new Date(meta.startedAt));
  const day = loadDailyMetrics(dateKey);

  const totals = emptyTotals();
  totals.sessions = 1;
  totals.sources = (sourceResults || []).length;
  let llmMerged = emptyLlmUsageTotals();

  for (const r of sourceResults || []) {
    if (r.status === 'failed') totals.sources_failed += 1;
    totals.jobs_listed += r.jobsListed || 0;
    totals.jobs_upserted += r.jobsUpserted || 0;
    totals.jobs_skipped += r.jobsSkipped || 0;
    totals.jobs_failed += r.jobsFailed || 0;
    totals.jobs_expired += r.jobsExpired || 0;
    totals.jobs_versioned += r.jobsVersioned || 0;
    totals.extracted += r.extracted || 0;
    totals.llm_calls += r.llmCalls || 0;
    llmMerged = mergeLlmUsageTotals(llmMerged, r.llmUsage || emptyLlmUsageTotals());
  }
  totals.llm = llmMerged;
  totals.estimated_cost_usd = llmMerged.estimated_cost_usd || 0;

  const balanceBefore = meta.deepseekBalanceBefore || null;
  const balanceAfter = meta.deepseekBalanceAfter || null;
  const balanceSpentUsd = balanceDeltaUsd(balanceBefore, balanceAfter);

  const session = {
    session_id: randomUUID(),
    started_at: meta.startedAt,
    finished_at: meta.finishedAt || new Date().toISOString(),
    metrics_date: dateKey,
    mode: meta.mode || 'incremental',
    source_filter: meta.sourceFilter || null,
    pricing_as_of: PRICING_AS_OF,
    cost_note:
      'estimated_cost_usd is from token usage × published rates; balance_spent_usd is account balance before − after for this run. File date = local day of started_at (not finished_at).',
    deepseek_balance_before: balanceBefore,
    deepseek_balance_after: balanceAfter,
    balance_spent_usd: balanceSpentUsd,
    totals,
  };

  day.sessions = day.sessions || [];
  day.sessions.push(session);
  day.day_totals = recomputeDayTotals(day.sessions);
  day.pricing_as_of = PRICING_AS_OF;
  day.updated_at = new Date().toISOString();
  if (balanceAfter) {
    day.deepseek_balance_latest = balanceAfter;
  }

  mkdirSync(METRICS_DIR, { recursive: true });
  const path = metricsPath(dateKey);
  writeFileSync(path, `${JSON.stringify(day, null, 2)}\n`, 'utf8');
  return { path, session, day_totals: day.day_totals };
}

/**
 * Positive = balance decreased (spent). Null if either snapshot missing.
 * @param {{ total_balance?: number|null }|null} before
 * @param {{ total_balance?: number|null }|null} after
 */
function balanceDeltaUsd(before, after) {
  if (before?.total_balance == null || after?.total_balance == null) return null;
  const delta = Number(before.total_balance) - Number(after.total_balance);
  return Math.round(delta * 1_000_000) / 1_000_000;
}

function recomputeDayTotals(sessions) {
  const t = emptyTotals();
  t.sessions = sessions.length;
  let llmMerged = emptyLlmUsageTotals();
  let balanceSpent = 0;
  let hasBalanceSpent = false;
  for (const session of sessions) {
    const s = session.totals || emptyTotals();
    t.sources += s.sources || 0;
    t.sources_failed += s.sources_failed || 0;
    t.jobs_listed += s.jobs_listed || 0;
    t.jobs_upserted += s.jobs_upserted || 0;
    t.jobs_skipped += s.jobs_skipped || 0;
    t.jobs_failed += s.jobs_failed || 0;
    t.jobs_expired += s.jobs_expired || 0;
    t.jobs_versioned += s.jobs_versioned || 0;
    t.extracted += s.extracted || 0;
    t.llm_calls += s.llm_calls || 0;
    llmMerged = mergeLlmUsageTotals(llmMerged, s.llm || {
      ...emptyLlmUsageTotals(),
      estimated_cost_usd: s.estimated_cost_usd || 0,
      calls: s.llm_calls || 0,
    });
    if (session.balance_spent_usd != null) {
      balanceSpent += Number(session.balance_spent_usd) || 0;
      hasBalanceSpent = true;
    }
  }
  t.llm = llmMerged;
  t.estimated_cost_usd = llmMerged.estimated_cost_usd || 0;
  t.balance_spent_usd = hasBalanceSpent
    ? Math.round(balanceSpent * 1_000_000) / 1_000_000
    : 0;
  return t;
}
