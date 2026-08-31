/**
 * @typedef {object} LlmProvider
 * @property {(prompt: string) => Promise<{ data: object|null, model: string, usage?: object }>} completeJson
 */

/**
 * @returns {LlmProvider|null}
 */
export function getLlmProvider() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;

  // Lazy import to keep ingest cheap when no key
  return {
    async completeJson(prompt) {
      const { completeJsonDeepseek } = await import('./deepseek.js');
      return completeJsonDeepseek(prompt);
    },
  };
}
