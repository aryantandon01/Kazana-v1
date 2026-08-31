import { CAREER_AREA_RULES, CAREER_AREA_TO_LEGACY_FAMILY } from '../../classification/catalog.js';
import { extractionResult, missingResult } from '../types.js';
import { computeConfidence } from '../confidence.js';

const EXTRACTOR = 'CareerAreaExtractor';

/**
 * Title-first career areas; body only for high-precision matches.
 * @param {import('../types.js').ExtractionContext} ctx
 */
export function extract(ctx) {
  const title = ctx.title || '';
  const body = (ctx.description || '').slice(0, 4000);
  const hits = [];

  for (const rule of CAREER_AREA_RULES) {
    const inTitle = rule.patterns.some((p) => p.test(title));
    if (inTitle) {
      hits.push({
        value: rule.value,
        confidence: 0.95,
        evidence: title,
        title: true,
      });
      continue;
    }
    // Body: skip overly broad tokens that false-positive (handled in catalog for react)
    const inBody = rule.patterns.some((p) => p.test(body));
    if (inBody) {
      hits.push({
        value: rule.value,
        confidence: 0.72,
        evidence: title,
        title: false,
      });
    }
  }

  hits.sort((a, b) => Number(b.title) - Number(a.title) || b.confidence - a.confidence);
  const values = [...new Set(hits.map((h) => h.value))];

  if (!values.length) {
    return {
      careerAreas: missingResult(EXTRACTOR),
      jobFamily: missingResult(EXTRACTOR),
    };
  }

  const primary = values[0];
  const conf = hits[0]?.confidence ?? 0.7;
  const family =
    primary && Object.prototype.hasOwnProperty.call(CAREER_AREA_TO_LEGACY_FAMILY, primary)
      ? CAREER_AREA_TO_LEGACY_FAMILY[primary]
      : null;

  return {
    careerAreas: extractionResult({
      value: values,
      confidence: computeConfidence('regex', conf, { hasEvidence: true }),
      source: 'regex',
      status: conf >= 0.85 ? 'trusted' : 'ambiguous',
      evidence: hits[0]?.evidence || null,
      extractor: EXTRACTOR,
    }),
    jobFamily: extractionResult({
      value: family,
      confidence: family ? 0.8 : 0,
      source: 'inferred',
      status: family ? 'inferred' : 'missing',
      evidence: primary,
      extractor: EXTRACTOR,
    }),
  };
}
