#!/usr/bin/env node
import { runIngestion } from './pipeline.js';
import { listAdapterSlugs } from './adapters/index.js';
import { appendIngestSession } from './metrics.js';
import { fetchDeepseekBalance } from './extraction/llm/cost.js';

function parseArgs(argv) {
  let source = null;
  let mode = 'incremental';

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source' || argv[i] === '-s') {
      source = argv[i + 1];
      i += 1;
    }
    if (argv[i] === '--full') {
      mode = 'full';
    }
    if (argv[i] === '--help' || argv[i] === '-h') {
      return { help: true };
    }
  }

  return { source, mode };
}

const { source, mode, help } = parseArgs(process.argv.slice(2));

if (help) {
  console.log(`
Kazana job ingestion

Usage:
  npm run ingest                         Incremental sync (default)
  npm run ingest:full                    Re-upsert all jobs from every source
  npm run ingest -- --source gh-stripe   One source, incremental
  npm run ingest -- --source gh-stripe --full

Modes:
  incremental  Only upsert new/changed jobs since last_fetched_at (per source)
  full         Re-fetch and upsert every job (refresh descriptions)

Metrics:
  Each run appends to logs/ingest-metrics/YYYY-MM-DD.json (gitignored)
  Includes LLM token usage + estimated USD cost (from DeepSeek usage × published rates)
  Snapshots DeepSeek balance before and after each run (balance_spent_usd = before − after)
  File date = local calendar day of run start (overnight runs stay on the start day's file)

Available adapter slugs: ${listAdapterSlugs().join(', ')}

Environment (.env):
  SUPABASE_URL or VITE_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY  (never expose to the browser)
  DEEPSEEK_API_KEY           (optional LLM escalation)
`);
  process.exit(0);
}

console.log(`Kazana job ingestion (${mode})`);
if (source) console.log(`Source filter: ${source}`);

const startedAt = new Date().toISOString();

(async () => {
  const deepseekBalanceBefore = await fetchDeepseekBalance();
  if (deepseekBalanceBefore?.total_balance != null) {
    console.log(
      `DeepSeek balance (before): $${Number(deepseekBalanceBefore.total_balance).toFixed(4)} ${deepseekBalanceBefore.currency || 'USD'}`,
    );
  }

  const results = await runIngestion(source, { mode });
  const finishedAt = new Date().toISOString();
  const deepseekBalanceAfter = await fetchDeepseekBalance();

  let metricsInfo = null;
  try {
    metricsInfo = appendIngestSession(results, {
      mode,
      sourceFilter: source || null,
      startedAt,
      finishedAt,
      deepseekBalanceBefore,
      deepseekBalanceAfter,
    });
  } catch (err) {
    console.warn('Failed to write ingest metrics:', err instanceof Error ? err.message : err);
  }

  const failed = results.filter((r) => r.status === 'failed');
  const upserted = results.reduce((s, r) => s + (r.jobsUpserted || 0), 0);
  const llm = results.reduce((s, r) => s + (r.llmCalls || 0), 0);
  const extracted = results.reduce((s, r) => s + (r.extracted || 0), 0);
  const cost = metricsInfo?.session?.totals?.estimated_cost_usd ?? 0;
  const tokens = metricsInfo?.session?.totals?.llm?.total_tokens ?? 0;
  const spent = metricsInfo?.session?.balance_spent_usd;

  console.log('\nIngestion complete');
  console.log(
    `  Session: upserted=${upserted}, extracted=${extracted}, llm_calls=${llm}` +
      (llm ? `, tokens=${tokens}, est_cost=$${Number(cost).toFixed(4)}` : '') +
      `, sources_failed=${failed.length}`,
  );
  if (deepseekBalanceBefore?.total_balance != null || deepseekBalanceAfter?.total_balance != null) {
    const before =
      deepseekBalanceBefore?.total_balance != null
        ? `$${Number(deepseekBalanceBefore.total_balance).toFixed(4)}`
        : 'n/a';
    const after =
      deepseekBalanceAfter?.total_balance != null
        ? `$${Number(deepseekBalanceAfter.total_balance).toFixed(4)}`
        : 'n/a';
    const spentStr = spent != null ? `$${Number(spent).toFixed(4)}` : 'n/a';
    console.log(`  DeepSeek balance: ${before} → ${after} (spent ${spentStr})`);
  }
  if (metricsInfo) {
    const t = metricsInfo.day_totals;
    console.log(`  Metrics file: ${metricsInfo.path}`);
    console.log(
      `  Day totals (${t.sessions} session(s)): upserted=${t.jobs_upserted}, llm_calls=${t.llm_calls}, est_cost=$${Number(t.estimated_cost_usd || 0).toFixed(4)}`,
    );
  }

  if (failed.length) {
    console.error(`\n${failed.length} source(s) failed`);
    process.exit(1);
  }
})().catch((err) => {
  console.error('Ingestion error:', err.message || err);
  process.exit(1);
});
