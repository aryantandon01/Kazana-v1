import { canonicalJobSchema, batchExtractionResponseSchema } from '../schema.js';

const DEFAULT_MODEL = 'deepseek-v4-flash';
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;

/**
 * @param {string} prompt
 * @returns {Promise<{ data: object|null, model: string, usage?: object }>}
 */
export async function completeJsonDeepseek(prompt) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return { data: null, model: 'none' };
  }

  const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;
  const json = await postCompletion(apiKey, {
    model,
    messages: [
      { role: 'system', content: 'Return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0,
    // Non-thinking mode — extraction should be deterministic JSON, not chain-of-thought
    thinking: { type: 'disabled' },
    response_format: { type: 'json_object' },
  });

  const content = json.choices?.[0]?.message?.content || '';
  return parseCompletionContent(content, model, json.usage);
}

/**
 * POST with a hard timeout and bounded exponential backoff for transient
 * failures (network errors, timeouts, 429, 5xx). 4xx errors are permanent.
 */
async function postCompletion(apiKey, payload) {
  const timeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const baseDelayMs = Number(process.env.DEEPSEEK_RETRY_BASE_MS);
  const retryBase = Number.isFinite(baseDelayMs) ? baseDelayMs : RETRY_BASE_MS;

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok) return await res.json();

      const text = await res.text();
      const message = `DeepSeek API ${res.status}: ${text.slice(0, 300)}`;
      if (res.status !== 429 && res.status < 500) {
        throw Object.assign(new Error(message), { permanent: true });
      }
      lastError = new Error(message);
    } catch (err) {
      if (err?.permanent) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(retryBase * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


/**
 * Parse the model's content into either:
 *  - a batched response `{ items: [...] }` (preserved intact — the single-job
 *    schema would strip the `items` key), or
 *  - a single canonical job object.
 *
 * Tolerant by design: if strict validation fails (e.g. one item has an invalid
 * enum), the raw values are returned and `validate.js` clamps them downstream.
 * Rejecting the whole response over one bad field would lose every other job.
 *
 * @param {string} content
 * @param {string} model
 * @param {object} [usage]
 * @returns {{ data: object|null, model: string, usage?: object }}
 */
export function parseCompletionContent(content, model, usage) {
  let parsed;
  try {
    parsed = JSON.parse(stripFences(content));
  } catch {
    return { data: null, model, usage };
  }

  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
    const batched = batchExtractionResponseSchema.safeParse(parsed);
    return {
      data: { items: batched.success ? batched.data.items : parsed.items },
      model,
      usage,
    };
  }

  const validated = canonicalJobSchema.safeParse(parsed);
  if (!validated.success) {
    // Still return raw parsed keys that look usable; validate.js will clean
    return { data: parsed, model, usage };
  }
  return { data: validated.data, model, usage };
}

function stripFences(s) {
  return String(s || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}
