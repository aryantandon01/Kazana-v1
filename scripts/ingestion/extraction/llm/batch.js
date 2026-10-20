/**
 * Batched, LLM-only job extraction — fetch + parse stage.
 *
 * This module deliberately does NOT build canonical jobs. It returns the raw
 * per-job LLM values keyed by external_id; the caller feeds them into
 * `runExtraction(ctx, { llmValues })` so the deterministic extractors, ATS
 * structured fields, confidence merge, validation, and canonicalization are
 * applied exactly as in the single-job path (one source of truth).
 *
 * Chunks are sized to keep output JSON well under the model's max tokens;
 * responses are keyed by external_id so partial failures fall back to the
 * per-job LLM path without re-batching the whole group.
 */

import { buildBatchExtractionPrompt } from './prompt.js';
import { getLlmProvider } from './provider.js';
import { accumulateLlmUsage, emptyLlmUsageTotals } from './cost.js';

const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 10;
const MAX_DESC_CHARS = 6000;

export function getBatchSize() {
  const raw = Number(process.env.EXTRACTION_BATCH_SIZE);
  if (Number.isFinite(raw) && raw >= 1) {
    return Math.min(raw, MAX_BATCH_SIZE);
  }
  return DEFAULT_BATCH_SIZE;
}

function chunkByOutputBudget(keys, max = 10) {
  const chunks = [];
  let current = [];
  let budget = 0;
  for (const key of keys) {
    const est = 1;
    if (current.length >= max || budget + est > 7000) {
      chunks.push(current);
      current = [];
      budget = 0;
    }
    current.push(key);
    budget += est;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/**
 * Run batched LLM extraction.
 *
 * @param {Array<{
 *   externalId: string,
 *   title: string,
 *   company?: string|null,
 *   location?: string|null,
 *   description?: string|null,
 *   yearsRequired?: number|string|null,
 *   employmentType?: string|null,
 *   workArrangement?: string|null,
 *   salary?: object|string|null,
 *   tags?: string[],
 * }>} jobs
 * @param {{ provider?: { completeJson: (prompt: string) => Promise<{ data: object|null, model: string, usage?: object }> } }} [options]
 * @returns {Promise<{
 *   llmValuesByExternalId: Map<string, object>,
 *   llmCalls: number,
 *   llmUsageTotals: ReturnType<typeof emptyLlmUsageTotals>,
 *   model: string|null,
 *   errors: string[],
 * }>}
 */
export async function runExtractionBatch(jobs, options = {}) {
  const provider = options.provider ?? getLlmProvider();
  if (!provider) {
    throw new Error('No LLM provider configured (DEEPSEEK_API_KEY missing)');
  }

  const keys = jobs.map((j) => String(j.externalId));
  const byId = new Map(jobs.map((j) => [String(j.externalId), j]));
  const chunks = chunkByOutputBudget(keys, getBatchSize());
  const llmValuesByExternalId = new Map();
  let llmCalls = 0;
  let llmUsageTotals = emptyLlmUsageTotals();
  let model = null;
  const errors = [];

  for (const chunk of chunks) {
    const prompt = buildBatchExtractionPrompt(
      chunk.map((id) => toPromptJob(byId.get(id))),
    );

    let result;
    try {
      result = await provider.completeJson(prompt);
      llmCalls += 1;
    } catch (err) {
      errors.push(
        `chunk ${chunk.join(', ')} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    if (result?.model) model = result.model;
    if (result?.usage) {
      accumulateLlmUsage(llmUsageTotals, result.usage, result.model);
    }

    if (!result?.data || !Array.isArray(result.data.items)) {
      errors.push(`chunk ${chunk.join(', ')} returned no items array`);
      continue;
    }

    const byReturnedId = new Map(
      result.data.items.map((item) => [String(item?.external_id), item]),
    );
    for (const id of chunk) {
      const item = byReturnedId.get(id);
      if (!item || typeof item !== 'object') {
        errors.push(`missing external_id ${id} in LLM response`);
        continue;
      }
      // Strip the routing key; every other field is merged by runExtraction.
      const { external_id: _externalId, ...values } = item;
      llmValuesByExternalId.set(id, values);
    }
  }

  return { llmValuesByExternalId, llmCalls, llmUsageTotals, model, errors };
}

function toPromptJob(job) {
  return {
    externalId: String(job.externalId),
    title: job.title,
    company: job.company ?? null,
    location: job.location ?? null,
    description: (job.description || '').slice(0, MAX_DESC_CHARS),
    yearsRequired: job.yearsRequired ?? null,
    employmentType: job.employmentType ?? null,
    workArrangement: job.workArrangement ?? null,
    salary: job.salary ?? null,
    tags: Array.isArray(job.tags) ? job.tags : [],
  };
}