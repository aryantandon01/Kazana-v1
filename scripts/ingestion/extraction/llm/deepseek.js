import { canonicalJobSchema } from '../schema.js';

const DEFAULT_MODEL = 'deepseek-v4-flash';

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
      // Non-thinking mode — extraction should be deterministic JSON, not chain-of-thought
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek API ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content || '';
  let parsed;
  try {
    parsed = JSON.parse(stripFences(content));
  } catch {
    return { data: null, model, usage: json.usage };
  }

  const validated = canonicalJobSchema.safeParse(parsed);
  if (!validated.success) {
    // Still return raw parsed keys that look usable; validate.js will clean
    return { data: parsed, model, usage: json.usage };
  }
  return { data: validated.data, model, usage: json.usage };
}

function stripFences(s) {
  return String(s || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}
