/**
 * Batched, all-LLM job extraction.
 *
 * Replaces the rule-based extractors + confidence escalation with a single
 * LLM call per chunk of JDs. Chunks are sized to keep output JSON well under
 * the model's max tokens; responses are keyed by external_id so partial
 * failures can be retried per JD without re-batching the whole group.
 *
 * ATS-native structured fields (title/company/location) are treated as
 * *locked* input — the model must not overwrite them.
 */

import { buildBatchExtractionPrompt } from './prompt.js';
import { getLlmProvider } from './provider.js';
import { validateAndNormalize, toCanonical } from '../validate.js';

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
 * @param {Array<{ externalId: string, title: string, company?: string|null, location?: string|null, description?: string|null }>} jobs
 * @returns {Promise<{ map: Map<string, { canonical: object, extraction: object, meta: object }>, llmCalls: number, errors: string[] }>}
 */
export async function runExtractionBatch(jobs, options = {}) {
  const provider = getLlmProvider();
  if (!provider) {
    throw new Error('No LLM provider configured (DEEPSEEK_API_KEY missing)');
  }

  const keys = jobs.map((j) => j.externalId);
  const byId = new Map(jobs.map((j) => [j.externalId, j]));
  const chunks = chunkByOutputBudget(keys, getBatchSize());
  const map = new Map();
  let llmCalls = 0;
  const errors = [];

  for (const chunk of chunks) {
    const chunkJobs = chunk.map((id) => byId.get(id));
    const prompt = buildBatchExtractionPrompt(
      chunkJobs.map((j) => ({
        externalId: j.externalId,
        title: j.title,
        company: j.company ?? null,
        location: j.location ?? null,
        description: (j.description || '').slice(0, MAX_DESC_CHARS),
      })),
    );

    let result;
    try {
      result = await provider.completeJson(prompt);
      llmCalls += 1;
    } catch (err) {
      errors.push(`chunk ${chunk.join(', ')} failed: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    if (!result?.data?.items || !Array.isArray(result.data.items)) {
      errors.push(`chunk ${chunk.join(', ')} returned no items array`);
      continue;
    }

    const byReturnedId = new Map(
      result.data.items.map((item) => [String(item.external_id), item]),
    );
    for (const id of chunk) {
      const item = byReturnedId.get(String(id));
      if (!item) {
        errors.push(`missing external_id ${id} in LLM response`);
        continue;
      }
      const source = byId.get(id);
      const fieldMap = validateAndNormalize({
        ...item,
        title: source.title,
        company: source.company ?? item.company ?? null,
        location: source.location ?? item.location ?? null,
      });
      map.set(id, {
        canonical: toCanonical(fieldMap, titleToCtx(source)),
        extraction: fieldMap,
        meta: {
          version: process.env.EXTRACTION_VERSION || 'llm-batch',
          llm_called: true,
          llm_model: result?.model || null,
          llm_usage: result?.usage || null,
          extracted_at: new Date().toISOString(),
        },
      });
    }
  }

  return { map, llmCalls, errors };
}

function titleToCtx(source) {
  return {
    title: source.title,
    company: source.company ?? null,
    location: source.location ?? null,
    description: source.description || '',
  };
}