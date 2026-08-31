#!/usr/bin/env node
/**
 * Reprocess existing jobs through the extraction pipeline.
 *
 * Usage:
 *   node scripts/ingestion/reprocess-extraction.js [--limit N] [--job-id UUID] [--force-llm]
 *
 * Env:
 *   DEEPSEEK_API_KEY, DEEPSEEK_MODEL, EXTRACTION_CONFIDENCE_THRESHOLD
 *   SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import {
  runExtraction,
  extractionToJobPatch,
  projectExtractionToFacetsTags,
} from './extraction/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, '../../.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const opts = { limit: 100, jobId: null, forceLlm: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') opts.limit = Number(argv[++i]) || 100;
    else if (a === '--job-id') opts.jobId = argv[++i];
    else if (a === '--force-llm') opts.forceLlm = true;
  }
  return opts;
}

async function main() {
  loadEnv();
  const opts = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let query = supabase
    .from('jobs')
    .select('id, title, company_name, location, description, url, raw_payload, years_required')
    .order('posted_at', { ascending: false });

  if (opts.jobId) query = query.eq('id', opts.jobId);
  else query = query.limit(opts.limit);

  const { data: jobs, error } = await query;
  if (error) throw new Error(error.message);
  if (!jobs?.length) {
    console.log('No jobs to reprocess');
    return;
  }

  console.log(`Reprocessing ${jobs.length} job(s)${opts.forceLlm ? ' (force LLM)' : ''}…`);
  let ok = 0;
  let fail = 0;
  let llm = 0;

  for (const job of jobs) {
    try {
      const ctx = {
        title: job.title,
        description: job.description,
        location: job.location,
        company: job.company_name,
        url: job.url,
        rawPayload: job.raw_payload,
        ats: {
          title: job.title,
          company: job.company_name,
          location: job.location,
          url: job.url,
          years_required: job.years_required,
        },
      };

      const result = await runExtraction(ctx, { forceLlm: opts.forceLlm });
      if (result.meta.llm_called) llm += 1;
      const patch = extractionToJobPatch(result);

      const { error: upErr } = await supabase.from('jobs').update(patch).eq('id', job.id);
      if (upErr) {
        // Retry without extraction columns if migration not applied
        if (upErr.message.includes('extraction') || upErr.message.includes('years_required_min')) {
          const { error: fallback } = await supabase
            .from('jobs')
            .update({
              years_required: patch.years_required,
              job_family: patch.job_family,
              level: patch.level,
            })
            .eq('id', job.id);
          if (fallback) throw fallback;
          console.warn(`  ${job.id}: extraction columns missing — updated legacy fields only`);
        } else {
          throw upErr;
        }
      } else {
        try {
          await projectExtractionToFacetsTags(supabase, job.id, result);
        } catch (projErr) {
          console.warn(
            `  ${job.id}: facet project failed: ${projErr instanceof Error ? projErr.message : projErr}`,
          );
        }
      }

      ok += 1;
      const min = result.canonical.minimumExperience;
      console.log(
        `  ✓ ${job.company_name} — ${job.title}` +
          (min != null ? ` [YOE min=${min}]` : ' [YOE unknown]') +
          (result.meta.llm_called ? ' [llm]' : ''),
      );
    } catch (err) {
      fail += 1;
      console.error(`  ✗ ${job.id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`Done. ok=${ok} fail=${fail} llm_calls=${llm}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
