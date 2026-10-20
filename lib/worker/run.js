/**
 * Worker orchestration shared by `scripts/worker/ingest.js` and
 * `scripts/worker/pulse.js`.
 *
 * Two independent cadences:
 *  - ingest: sweep job sources continuously. A 100+ source pass takes tens of
 *    minutes, so it runs in its own process and must never block delivery.
 *  - pulse:  match every user, then drain the notification queue. This is the
 *    latency-critical hop — new jobs become WhatsApp/push alerts here and it
 *    runs every five minutes.
 *
 * Dependencies are injected so sequencing and error isolation are unit-testable
 * without Supabase, DeepSeek or WhatsApp credentials.
 */

function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Aggregate the per-source results returned by `runIngestion`.
 * @param {Array<object>} [results]
 */
export function summarizeIngest(results = []) {
  const summary = {
    sources: results.length,
    succeeded: 0,
    failed: 0,
    jobs_listed: 0,
    jobs_fetched: 0,
    jobs_upserted: 0,
    llm_calls: 0,
    estimated_cost_usd: 0,
    failed_sources: [],
  };

  for (const result of results) {
    if (result?.status === 'failed') {
      summary.failed += 1;
      if (summary.failed_sources.length < 10) {
        summary.failed_sources.push(result.source || 'unknown');
      }
    } else {
      summary.succeeded += 1;
    }

    summary.jobs_listed += Number(result?.jobsListed) || 0;
    summary.jobs_fetched += Number(result?.jobsFetched) || 0;
    summary.jobs_upserted += Number(result?.jobsUpserted) || 0;
    summary.llm_calls += Number(result?.llmCalls) || 0;

    const cost = Number(result?.llmUsage?.estimated_cost_usd);
    if (Number.isFinite(cost)) summary.estimated_cost_usd += cost;
  }

  summary.estimated_cost_usd = Number(summary.estimated_cost_usd.toFixed(4));
  return summary;
}

/**
 * Run one full ingestion sweep. Never throws: a failed sweep must not kill the
 * long-running worker loop.
 *
 * @param {{ ingest: () => Promise<Array<object>>, log?: (message: string, fields?: string) => void }} options
 */
export async function runIngestCycle({ ingest, log = console.log } = {}) {
  if (typeof ingest !== 'function') {
    throw new TypeError('runIngestCycle requires an ingest function');
  }

  const startedAt = Date.now();

  try {
    const results = await ingest();
    const summary = summarizeIngest(results);
    const report = {
      ...summary,
      ok: summary.failed === 0,
      duration_ms: Date.now() - startedAt,
    };
    log('[worker] ingest', JSON.stringify(report));
    return report;
  } catch (err) {
    const report = {
      ok: false,
      error: errorMessage(err),
      duration_ms: Date.now() - startedAt,
    };
    log('[worker] ingest_failed', JSON.stringify({ error: report.error }));
    return report;
  }
}

/**
 * One match → notify pulse.
 *
 * Matching runs first because it enqueues the rows the dispatcher drains. A
 * matching failure must not block the queue drain: retries and rows from an
 * earlier pulse still need to go out.
 *
 * @param {{
 *   match: () => Promise<object>,
 *   notify: () => Promise<object>,
 *   log?: (message: string, fields?: string) => void,
 * }} options
 */
export async function runPulse({ match, notify, log = console.log } = {}) {
  if (typeof match !== 'function' || typeof notify !== 'function') {
    throw new TypeError('runPulse requires match and notify functions');
  }

  const startedAt = Date.now();
  const errors = [];
  let matching = null;
  let notifications = null;

  try {
    matching = await match();
    log('[worker] match', JSON.stringify(matching ?? {}));
  } catch (err) {
    errors.push(`match: ${errorMessage(err)}`);
    log('[worker] match_failed', JSON.stringify({ error: errorMessage(err) }));
  }

  try {
    notifications = await notify();
    log('[worker] notify', JSON.stringify(notifications ?? {}));
  } catch (err) {
    errors.push(`notify: ${errorMessage(err)}`);
    log('[worker] notify_failed', JSON.stringify({ error: errorMessage(err) }));
  }

  return {
    ok: errors.length === 0,
    matching,
    notifications,
    errors,
    duration_ms: Date.now() - startedAt,
  };
}
