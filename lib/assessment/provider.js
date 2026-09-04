/**
 * Model-agnostic LLM provider for the assessment engine.
 *
 * Mirrors the extraction pipeline's provider pattern (`scripts/ingestion/extraction/llm/provider.js`)
 * so the business logic never hard-couples to one vendor. Swap models via env:
 *
 *   DEEPSEEK_API_KEY=...        (default provider)
 *   DEEPSEEK_MODEL=deepseek-v4-flash
 *
 * The provider returns a parsed JSON object. Prompt templates live separately
 * (`lib/assessment/prompts.js`) and are versioned on every output.
 */

const DEFAULT_MODEL = 'deepseek-v4-flash';

/**
 * Single JSON completion call.
 * @param {string} prompt
 * @returns {Promise<{ data: object|null, model: string, usage?: object, version: string }>}
 */
export async function completeJson(prompt) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return { data: null, model: 'none', version: 'none', provider: 'none' };
  }

  const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Return valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      // Non-thinking mode — assessment should be deterministic JSON, not chain-of-thought
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Assessment API ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content || '';
  let parsed;
  try {
    parsed = JSON.parse(stripFences(content));
  } catch {
    return { data: null, model, usage: json.usage, version: 'none', provider: 'deepseek' };
  }

  return { data: parsed, model, usage: json.usage, version: 'assessment-v1', provider: 'deepseek' };
}

function stripFences(s) {
  return String(s || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/**
 * Helper: wrap a free-form LLM response into a confidence-scored assessment.
 * The engine persists `{value, confidence, evidence, source, version}`.
 */
export function asConfident(value, confidence, evidence, source, version) {
  return { value, confidence, evidence, source: source || 'llm', version: version || 'assessment-v1' };
}