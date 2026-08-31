import { IMPORTANT_FIELDS } from './types.js';

const SOURCE_PRIOR = {
  structured: 1.0,
  dictionary: 0.9,
  regex: 0.75,
  llm: 0.7,
  inferred: 0.45,
};

/**
 * Blend source reliability with extractor-reported confidence.
 * @param {import('./types.js').ExtractionSource} source
 * @param {number} rawConfidence
 * @param {{ hasEvidence?: boolean }} [opts]
 */
export function computeConfidence(source, rawConfidence, opts = {}) {
  const prior = SOURCE_PRIOR[source] ?? 0.5;
  let c = Math.min(prior, Math.max(0, Number(rawConfidence) || 0));
  if (opts.hasEvidence === false) c *= 0.85;
  if (opts.hasEvidence === true && source !== 'structured') c = Math.min(1, c + 0.05);
  return Math.round(c * 1000) / 1000;
}

/**
 * @param {Record<string, import('./types.js').ExtractionResult>} fieldMap
 * @param {string[]} [important]
 * @param {number} [threshold]
 */
export function evaluateConfidence(fieldMap, important = IMPORTANT_FIELDS, threshold = 0.7) {
  const weak = [];
  for (const field of important) {
    const r = fieldMap[field];
    if (!r) {
      weak.push(field);
      continue;
    }
    if (r.status === 'missing' || r.status === 'ambiguous' || r.confidence < threshold) {
      // Empty arrays for skills/careerAreas count as missing
      if (Array.isArray(r.value) && r.value.length === 0) {
        weak.push(field);
        continue;
      }
      if (r.value == null || r.status === 'missing' || r.status === 'ambiguous' || r.confidence < threshold) {
        weak.push(field);
      }
    }
  }
  return {
    needsLlm: weak.length > 0,
    weakFields: weak,
    threshold,
  };
}

/**
 * Merge LLM values into deterministic results without overwriting trusted/structured.
 * @param {Record<string, import('./types.js').ExtractionResult>} deterministic
 * @param {Record<string, *>} llmValues
 * @param {string} extractorName
 */
export function mergeExtractions(deterministic, llmValues, extractorName = 'deepseek') {
  const out = { ...deterministic };
  if (!llmValues || typeof llmValues !== 'object') return out;

  for (const [field, llmValue] of Object.entries(llmValues)) {
    if (llmValue == null) continue;
    if (Array.isArray(llmValue) && !llmValue.length) continue;

    const existing = out[field];
    if (existing) {
      if (existing.source === 'structured') continue;
      if (existing.status === 'trusted' && existing.confidence >= 0.85) continue;
      if (
        existing.value != null &&
        !(Array.isArray(existing.value) && !existing.value.length) &&
        existing.confidence >= 0.85 &&
        existing.status !== 'ambiguous'
      ) {
        continue;
      }
    }

    out[field] = {
      value: llmValue,
      confidence: computeConfidence('llm', 0.75, { hasEvidence: false }),
      source: 'llm',
      status: 'inferred',
      evidence: null,
      extractor: extractorName,
    };
  }
  return out;
}
