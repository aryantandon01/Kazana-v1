/**
 * Estimate DeepSeek API cost from per-response usage.
 * DeepSeek does not expose historical cost via API key — only balance +
 * per-completion `usage`. Rates from published pricing (USD / 1M tokens).
 *
 * @see https://api-docs.deepseek.com/quick_start/pricing
 */

/** @type {Record<string, { input_cache_hit: number, input_cache_miss: number, output: number }>} */
export const DEEPSEEK_RATES_USD_PER_M = {
  'deepseek-v4-flash': {
    input_cache_hit: 0.0028,
    input_cache_miss: 0.14,
    output: 0.28,
  },
  'deepseek-v4-pro': {
    input_cache_hit: 0.003625,
    input_cache_miss: 0.435,
    output: 0.87,
  },
  // Retired aliases mapped to flash rates (post July 2026 deprecation they bill as flash)
  'deepseek-chat': {
    input_cache_hit: 0.0028,
    input_cache_miss: 0.14,
    output: 0.28,
  },
  'deepseek-reasoner': {
    input_cache_hit: 0.0028,
    input_cache_miss: 0.14,
    output: 0.28,
  },
};

export const PRICING_AS_OF = '2026-07-25';

/**
 * @param {string|null|undefined} model
 */
export function ratesForModel(model) {
  const key = String(model || process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash').toLowerCase();
  return DEEPSEEK_RATES_USD_PER_M[key] || DEEPSEEK_RATES_USD_PER_M['deepseek-v4-flash'];
}

/**
 * Normalize DeepSeek / OpenAI-style usage into token buckets.
 * @param {object|null|undefined} usage
 */
export function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cache_hit_tokens: 0,
      cache_miss_tokens: 0,
    };
  }

  const prompt = Number(usage.prompt_tokens) || 0;
  const completion = Number(usage.completion_tokens) || 0;
  const total = Number(usage.total_tokens) || prompt + completion;

  let cacheHit =
    Number(usage.prompt_cache_hit_tokens) ||
    Number(usage.prompt_tokens_details?.cached_tokens) ||
    0;
  let cacheMiss = Number(usage.prompt_cache_miss_tokens) || 0;

  if (!cacheMiss && prompt > 0) {
    cacheMiss = Math.max(0, prompt - cacheHit);
  }
  if (cacheHit + cacheMiss === 0 && prompt > 0) {
    // No cache breakdown — treat all input as miss (upper-bound estimate)
    cacheMiss = prompt;
  }

  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: total,
    cache_hit_tokens: cacheHit,
    cache_miss_tokens: cacheMiss,
  };
}

/**
 * @param {object|null|undefined} usage
 * @param {string|null|undefined} model
 * @returns {{ usd: number, tokens: ReturnType<typeof normalizeUsage>, rates: object, model: string }}
 */
export function estimateCostUsd(usage, model) {
  const modelId = String(model || process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash');
  const rates = ratesForModel(modelId);
  const tokens = normalizeUsage(usage);
  const usd =
    (tokens.cache_hit_tokens / 1_000_000) * rates.input_cache_hit +
    (tokens.cache_miss_tokens / 1_000_000) * rates.input_cache_miss +
    (tokens.completion_tokens / 1_000_000) * rates.output;

  return {
    usd: roundUsd(usd),
    tokens,
    rates,
    model: modelId,
  };
}

export function emptyLlmUsageTotals() {
  return {
    calls: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    cache_hit_tokens: 0,
    cache_miss_tokens: 0,
    estimated_cost_usd: 0,
    by_model: {},
  };
}

/**
 * @param {ReturnType<typeof emptyLlmUsageTotals>} totals
 * @param {object|null|undefined} usage
 * @param {string|null|undefined} model
 */
export function accumulateLlmUsage(totals, usage, model) {
  if (!totals) return emptyLlmUsageTotals();
  const estimate = estimateCostUsd(usage, model);
  const t = estimate.tokens;
  totals.calls += 1;
  totals.prompt_tokens += t.prompt_tokens;
  totals.completion_tokens += t.completion_tokens;
  totals.total_tokens += t.total_tokens;
  totals.cache_hit_tokens += t.cache_hit_tokens;
  totals.cache_miss_tokens += t.cache_miss_tokens;
  totals.estimated_cost_usd = roundUsd(totals.estimated_cost_usd + estimate.usd);

  const mid = estimate.model;
  if (!totals.by_model[mid]) {
    totals.by_model[mid] = {
      calls: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cache_hit_tokens: 0,
      cache_miss_tokens: 0,
      estimated_cost_usd: 0,
    };
  }
  const m = totals.by_model[mid];
  m.calls += 1;
  m.prompt_tokens += t.prompt_tokens;
  m.completion_tokens += t.completion_tokens;
  m.total_tokens += t.total_tokens;
  m.cache_hit_tokens += t.cache_hit_tokens;
  m.cache_miss_tokens += t.cache_miss_tokens;
  m.estimated_cost_usd = roundUsd(m.estimated_cost_usd + estimate.usd);
  return totals;
}

/**
 * Merge two llm usage total objects.
 */
export function mergeLlmUsageTotals(a, b) {
  const out = emptyLlmUsageTotals();
  for (const part of [a, b]) {
    if (!part) continue;
    out.calls += part.calls || 0;
    out.prompt_tokens += part.prompt_tokens || 0;
    out.completion_tokens += part.completion_tokens || 0;
    out.total_tokens += part.total_tokens || 0;
    out.cache_hit_tokens += part.cache_hit_tokens || 0;
    out.cache_miss_tokens += part.cache_miss_tokens || 0;
    out.estimated_cost_usd = roundUsd(out.estimated_cost_usd + (part.estimated_cost_usd || 0));
    for (const [mid, m] of Object.entries(part.by_model || {})) {
      if (!out.by_model[mid]) {
        out.by_model[mid] = {
          calls: 0,
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          cache_hit_tokens: 0,
          cache_miss_tokens: 0,
          estimated_cost_usd: 0,
        };
      }
      const dest = out.by_model[mid];
      dest.calls += m.calls || 0;
      dest.prompt_tokens += m.prompt_tokens || 0;
      dest.completion_tokens += m.completion_tokens || 0;
      dest.total_tokens += m.total_tokens || 0;
      dest.cache_hit_tokens += m.cache_hit_tokens || 0;
      dest.cache_miss_tokens += m.cache_miss_tokens || 0;
      dest.estimated_cost_usd = roundUsd(dest.estimated_cost_usd + (m.estimated_cost_usd || 0));
    }
  }
  return out;
}

function roundUsd(n) {
  return Math.round((Number(n) || 0) * 1_000_000) / 1_000_000;
}

/**
 * Snapshot account balance (not historical spend). Optional; best-effort.
 * @returns {Promise<object|null>}
 */
export async function fetchDeepseekBalance() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.deepseek.com/user/balance', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const infos = Array.isArray(json.balance_infos) ? json.balance_infos : [];
    const usd = infos.find((i) => String(i.currency || '').toUpperCase() === 'USD') || infos[0];
    return {
      fetched_at: new Date().toISOString(),
      is_available: Boolean(json.is_available),
      currency: usd?.currency || null,
      total_balance: usd?.total_balance != null ? Number(usd.total_balance) : null,
      granted_balance: usd?.granted_balance != null ? Number(usd.granted_balance) : null,
      topped_up_balance: usd?.topped_up_balance != null ? Number(usd.topped_up_balance) : null,
    };
  } catch {
    return null;
  }
}
