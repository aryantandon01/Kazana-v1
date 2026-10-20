#!/usr/bin/env node
/**
 * Recompute `jobs.job_family` from the deterministic career-area rules.
 *
 * `job_family` is derived from title/description by
 * `extraction/extractors/careerAreas.js` (regex only — no LLM calls), so the
 * backlog can be corrected cheaply after a rules change.
 *
 * Usage:
 *   node scripts/ingestion/backfill-job-families.js                 # dry run
 *   node scripts/ingestion/backfill-job-families.js --apply         # write
 *   node scripts/ingestion/backfill-job-families.js --only-family ai_engineer --apply
 *   node scripts/ingestion/backfill-job-families.js --allow-null --apply
 *   node scripts/ingestion/backfill-job-families.js --limit 5000
 *
 * Safety: by default a non-AI family is never replaced with `null`. Rows
 * currently labelled `ai_engineer` *are* allowed to become `null` — that label
 * was produced by the old body-matching bug and must be removable. Pass
 * `--allow-null` to fully normalize every row to the deterministic rules.
 */

import '../../lib/loadEnv.js';
import { getAdminClient } from '../../lib/supabase/admin.js';
import { extract } from './extraction/extractors/careerAreas.js';

const PAGE_SIZE = 1000;
const DEFAULT_BATCH_SIZE = 100;
const BROKEN_FAMILY = 'ai_engineer';

function parseArgs(argv) {
  const opts = {
    apply: false,
    limit: null,
    batchSize: DEFAULT_BATCH_SIZE,
    onlyFamily: null,
    allowNull: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--allow-null') opts.allowNull = true;
    else if (arg === '--limit') opts.limit = Number(argv[++i]) || null;
    else if (arg === '--batch-size') opts.batchSize = Number(argv[++i]) || DEFAULT_BATCH_SIZE;
    else if (arg === '--only-family') opts.onlyFamily = argv[++i] || null;
  }
  return opts;
}

function resolveFamily(job) {
  const result = extract({ title: job.title || '', description: job.description || '' });
  return result.jobFamily?.value ?? null;
}

function shouldWrite(current, next, { allowNull = false } = {}) {
  if (current === next) return false;
  // Repairing the broken label is always allowed, even to null.
  if (current === BROKEN_FAMILY) return true;
  // Otherwise never destroy a known family with an unknown one unless the
  // caller explicitly asks for a full normalization.
  return next != null || allowNull;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const supabase = getAdminClient();

  console.log(
    `Backfilling job_family${opts.onlyFamily ? ` (only ${opts.onlyFamily})` : ''}` +
      `${opts.allowNull ? ' (full normalization)' : ''}` +
      `${opts.apply ? '' : ' — DRY RUN (pass --apply to write)'}`,
  );

  let lastId = null;
  let scanned = 0;
  let changed = 0;
  let unchanged = 0;
  let kept = 0;
  const transitions = new Map();
  /** @type {Map<string|null, string[]>} */
  const updates = new Map();

  while (true) {
    if (opts.limit && scanned >= opts.limit) break;

    const pageLimit = Math.min(PAGE_SIZE, opts.limit ? opts.limit - scanned : PAGE_SIZE);
    let query = supabase
      .from('jobs')
      .select('id, title, description, job_family')
      .order('id', { ascending: true })
      .limit(pageLimit);
    if (lastId) query = query.gt('id', lastId);
    if (opts.onlyFamily) query = query.eq('job_family', opts.onlyFamily);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const job of data) {
      scanned += 1;
      const next = resolveFamily(job);
      const current = job.job_family || null;

      if (current === next) {
        unchanged += 1;
        continue;
      }
      if (!shouldWrite(current, next, opts)) {
        kept += 1;
        continue;
      }

      changed += 1;
      const key = `${current ?? 'null'} → ${next ?? 'null'}`;
      transitions.set(key, (transitions.get(key) || 0) + 1);
      if (!updates.has(next)) updates.set(next, []);
      updates.get(next).push(job.id);
    }

    lastId = data[data.length - 1].id;
    if (data.length < pageLimit) break;
  }

  console.log(
    `Scanned: ${scanned}, changed: ${changed}, unchanged: ${unchanged}, kept existing: ${kept}`,
  );
  if (transitions.size) {
    console.log('Top transitions:');
    for (const [key, count] of [...transitions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
      console.log(`  ${key}: ${count}`);
    }
  }

  if (!opts.apply) {
    console.log('Dry run complete — no rows written.');
    return;
  }

  let written = 0;
  for (const [family, ids] of updates) {
    for (let i = 0; i < ids.length; i += opts.batchSize) {
      const chunk = ids.slice(i, i + opts.batchSize);
      const { error } = await supabase.from('jobs').update({ job_family: family }).in('id', chunk);
      if (error) throw new Error(`${family ?? 'null'}: ${error.message}`);
      written += chunk.length;
    }
  }
  console.log(`Updated ${written} job(s).`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
