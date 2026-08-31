import { supabaseAdmin } from './supabase.js';
import { getAdapterForSource } from './adapters/index.js';
import { normalizeJob } from './normalize.js';
import { applyFreshness } from './freshness.js';
import {
  runExtraction,
  extractionToJobPatch,
  projectExtractionToFacetsTags,
} from './extraction/index.js';
import {
  expireRemovedJobs,
  loadExistingJobs,
  normalizeFetchResult,
  shouldUpsertJob,
  sinceWithOverlap,
} from './incremental.js';
import {
  accumulateLlmUsage,
  emptyLlmUsageTotals,
} from './extraction/llm/cost.js';
import { runExtractionBatch } from './extraction/llm/batch.js';

const BATCH_SIZE = 50;

function isMissingColumnError(error, column) {
  const message = error?.message || '';
  return message.includes(`'${column}'`) && message.includes('schema cache');
}

function stripColumns(rows, columns) {
  return rows.map((row) => {
    const next = { ...row };
    for (const column of columns) {
      delete next[column];
    }
    return next;
  });
}

async function upsertJobRows(rows) {
  const selectCols = 'id, external_id';
  let result = await supabaseAdmin
    .from('jobs')
    .upsert(rows, { onConflict: 'source_id,external_id', count: 'exact' })
    .select(selectCols);

  if (!result.error) return result;

  const omit = [];
  if (isMissingColumnError(result.error, 'years_required')) {
    omit.push('years_required');
    console.warn('  jobs.years_required column missing — run db/migrations/20260707010000_jobs_years_required.sql');
  }
  if (
    isMissingColumnError(result.error, 'discovered_at') ||
    isMissingColumnError(result.error, 'last_updated_at') ||
    isMissingColumnError(result.error, 'job_version') ||
    isMissingColumnError(result.error, 'content_hash')
  ) {
    omit.push('discovered_at', 'last_updated_at', 'job_version', 'content_hash');
    console.warn('  jobs freshness columns missing — run db/migrations/20260718080000_job_freshness.sql');
  }
  if (
    isMissingColumnError(result.error, 'extraction') ||
    isMissingColumnError(result.error, 'years_required_min') ||
    isMissingColumnError(result.error, 'years_required_max') ||
    isMissingColumnError(result.error, 'extraction_version') ||
    isMissingColumnError(result.error, 'extracted_at')
  ) {
    omit.push(
      'extraction',
      'years_required_min',
      'years_required_max',
      'extraction_version',
      'extracted_at',
    );
    console.warn(
      '  jobs extraction columns missing — run db/migrations/20260726090000_job_extraction_canonical.sql',
    );
  }

  if (!omit.length) return result;

  result = await supabaseAdmin
    .from('jobs')
    .upsert(stripColumns(rows, [...new Set(omit)]), { onConflict: 'source_id,external_id', count: 'exact' })
    .select(selectCols);

  return result;
}

async function projectExtractionBatch(rows, extractionsByExternalId) {
  let projected = 0;
  for (const row of rows) {
    const extraction = extractionsByExternalId.get(String(row.external_id));
    if (!extraction || !row.id) continue;
    try {
      await projectExtractionToFacetsTags(supabaseAdmin, row.id, extraction);
      projected += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('schema cache') || message.includes('does not exist')) {
        console.warn('  Semantic tables missing — run db/migrations/20260719090000_semantic_facets_tags.sql');
        return projected;
      }
      console.warn(`  Extraction project failed for ${row.external_id}: ${message}`);
    }
  }
  return projected;
}

/**
 * Build extraction context from normalized job + raw ATS payload.
 */
function buildExtractionContext(normalized, raw) {
  const payload = raw.raw_payload || normalized.raw_payload || {};
  return {
    title: normalized.title,
    description: normalized.description,
    location: normalized.location,
    company: normalized.company_name,
    url: normalized.url,
    atsTags: raw.tags || raw.category || [],
    rawPayload: payload,
    ats: {
      title: raw.title,
      company: raw.company_name || raw.company,
      location: raw.location,
      url: raw.url,
      years_required: raw.years_required ?? null,
      minimumExperience: raw.minimumExperience ?? raw.years_required_min ?? null,
      maximumExperience: raw.maximumExperience ?? raw.years_required_max ?? null,
      employmentType: raw.employment_type || raw.employmentType || null,
      workArrangement: raw.work_arrangement || raw.workArrangement || null,
      salary: raw.salary || raw.compensation || null,
      tags: raw.tags || raw.category || [],
    },
  };
}

/**
 * @param {string} [sourceSlug]
 * @param {{ mode?: import('./types.js').IngestMode }} [options]
 */
export async function runIngestion(sourceSlug, options = {}) {
  const mode = options.mode || 'incremental';

  let query = supabaseAdmin
    .from('job_sources')
    .select('*')
    .eq('is_active', true);

  if (sourceSlug) {
    query = query.eq('slug', sourceSlug);
  }

  const { data: sources, error } = await query;
  if (error) throw new Error(`Failed to load job_sources: ${error.message}`);
  if (!sources?.length) {
    console.warn(sourceSlug ? `No active source found for slug: ${sourceSlug}` : 'No active job sources');
    return [];
  }

  const results = [];
  for (const source of sources) {
    results.push(await ingestSource(source, mode));
  }
  return results;
}

/**
 * @param {import('./types.js').JobSourceRecord} source
 * @param {import('./types.js').IngestMode} mode
 */
async function ingestSource(source, mode) {
  const startedAt = new Date().toISOString();
  console.log(`\n▶ Ingesting: ${source.name} (${source.slug}) [${mode}]`);

  const { data: run, error: runError } = await supabaseAdmin
    .from('ingestion_runs')
    .insert({ source_id: source.id, status: 'running', started_at: startedAt })
    .select('id')
    .single();

  if (runError) {
    throw new Error(`Failed to create ingestion_run: ${runError.message}`);
  }

  const runId = run.id;
  let jobsListed = 0;
  let jobsFetched = 0;
  let jobsUpserted = 0;
  let jobsSkipped = 0;
  let jobsFailed = 0;
  let jobsExpired = 0;
  let jobsVersioned = 0;
  let extracted = 0;
  let llmCalls = 0;
  let llmUsage = emptyLlmUsageTotals();

  try {
    const { ids: existingIds, byExternalId } = await loadExistingJobs(supabaseAdmin, source.id);
    const since = sinceWithOverlap(source.last_fetched_at);
    const adapter = getAdapterForSource(source);
    const fetchResult = normalizeFetchResult(
      await adapter.fetch(source, {
        mode,
        since: since?.toISOString() || null,
        existingIds,
      }),
    );

    jobsListed = fetchResult.allExternalIds.length;
    jobsFetched = fetchResult.jobs.length;

    const jobsToUpsert = fetchResult.jobs.filter((raw) =>
      shouldUpsertJob(raw, existingIds, since, mode),
    );
    jobsSkipped = fetchResult.jobs.length - jobsToUpsert.length;

    if (mode === 'incremental') {
      console.log(`  Listed ${jobsListed}, upserting ${jobsToUpsert.length}, skipping ${jobsSkipped}`);
    } else {
      console.log(`  Fetched ${jobsFetched} raw jobs`);
    }

    for (let i = 0; i < jobsToUpsert.length; i += BATCH_SIZE) {
      const batch = jobsToUpsert.slice(i, i + BATCH_SIZE);
      const rows = [];
      const extractionsByExternalId = new Map();

      // All-LLM by default when a provider key is set; rule-based only when
      // EXTRACTION_MODE=rule (or no key is available).
      const useBatchedLlm =
        process.env.EXTRACTION_MODE === 'llm' ||
        (process.env.EXTRACTION_MODE !== 'rule' && !!process.env.DEEPSEEK_API_KEY);
      if (useBatchedLlm) {
        const batchInput = batch
          .map((raw) => {
            const normalized = normalizeJob(raw);
            return {
              externalId: String(normalized.external_id),
              title: normalized.title,
              company: normalized.company_name,
              location: normalized.location,
              description: normalized.description,
            };
          })
          .filter((j) => j.externalId);
        const batched = await runExtractionBatch(batchInput);
        for (const [externalId, result] of batched.map.entries()) {
          extractionsByExternalId.set(externalId, result);
        }
        llmCalls += batched.llmCalls;
        if (batched.errors.length) {
          console.warn(`  LLM batch errors (${batched.errors.length})`, batched.errors.slice(0, 3));
        }
      }

      for (const raw of batch) {
        try {
          const normalized = normalizeJob(raw);
          if (!normalized.url || !normalized.title) {
            jobsFailed += 1;
            continue;
          }

          const existing = byExternalId.get(String(normalized.external_id)) || null;
          const withFreshness = applyFreshness(normalized, existing, {
            providerUpdatedAt: raw.updated_at || null,
          });

          if (existing && withFreshness.job_version > (existing.job_version || 1)) {
            jobsVersioned += 1;
          }

          const extractionResult = await runExtraction(buildExtractionContext(withFreshness, raw));
          extracted += 1;
          if (extractionResult.meta?.llm_called) {
            llmCalls += 1;
            accumulateLlmUsage(
              llmUsage,
              extractionResult.meta.llm_usage,
              extractionResult.meta.llm_model,
            );
          }
          extractionsByExternalId.set(String(normalized.external_id), extractionResult);
          const patch = extractionToJobPatch(extractionResult);

          // Drop adapter-only fields that are not DB columns
          const { updated_at: _updatedAt, ...row } = withFreshness;
          rows.push({
            source_id: source.id,
            ...row,
            ...patch,
            job_family: patch.job_family || row.job_family || null,
            level: patch.level || row.level || null,
          });
        } catch {
          jobsFailed += 1;
        }
      }

      if (rows.length === 0) continue;

      const { data: upserted, error: upsertError, count } = await upsertJobRows(rows);

      if (upsertError) {
        console.error(`  Batch upsert error: ${upsertError.message}`);
        jobsFailed += rows.length;
      } else {
        jobsUpserted += count ?? rows.length;
        await projectExtractionBatch(upserted || [], extractionsByExternalId);
      }
    }

    if (mode === 'incremental' && fetchResult.allExternalIds.length > 0) {
      const expiry = await expireRemovedJobs(
        supabaseAdmin,
        source.id,
        new Set(fetchResult.allExternalIds),
      );
      jobsExpired = expiry.expired;
      if (jobsExpired > 0) {
        console.log(
          `  Expired ${jobsExpired} removed job(s)` +
            (expiry.matchesRemoved ? `, deleted ${expiry.matchesRemoved} match(es)` : ''),
        );
      }
    }

    await supabaseAdmin
      .from('job_sources')
      .update({ last_fetched_at: new Date().toISOString() })
      .eq('id', source.id);

    await supabaseAdmin
      .from('ingestion_runs')
      .update({
        status: 'success',
        finished_at: new Date().toISOString(),
        jobs_fetched: jobsListed,
        jobs_upserted: jobsUpserted,
        jobs_failed: jobsFailed,
      })
      .eq('id', runId);

    console.log(
      `  ✓ Upserted ${jobsUpserted}, versioned ${jobsVersioned}, skipped ${jobsSkipped}, failed ${jobsFailed}` +
        (llmCalls
          ? `, llm ${llmCalls}/${extracted}` +
            (llmUsage.estimated_cost_usd
              ? ` (~$${llmUsage.estimated_cost_usd.toFixed(4)})`
              : '')
          : ''),
    );
    return {
      source: source.slug,
      mode,
      jobsListed,
      jobsFetched,
      jobsUpserted,
      jobsVersioned,
      jobsSkipped,
      jobsFailed,
      jobsExpired,
      extracted,
      llmCalls,
      llmUsage,
      status: 'success',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ Failed: ${message}`);

    await supabaseAdmin
      .from('ingestion_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        jobs_fetched: jobsListed,
        jobs_upserted: jobsUpserted,
        jobs_failed: jobsFailed,
        error_message: message,
      })
      .eq('id', runId);

    return {
      source: source.slug,
      mode,
      jobsListed,
      jobsFetched,
      jobsUpserted,
      jobsVersioned,
      jobsSkipped,
      jobsFailed,
      jobsExpired,
      extracted,
      llmCalls,
      llmUsage,
      status: 'failed',
      error: message,
    };
  }
}
