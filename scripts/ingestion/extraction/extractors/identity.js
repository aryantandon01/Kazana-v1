import { extractionResult, missingResult } from '../types.js';
import { computeConfidence } from '../confidence.js';

const EXTRACTOR = 'IdentityExtractor';

/**
 * @param {import('../types.js').ExtractionContext} ctx
 */
export function extract(ctx) {
  const ats = ctx.ats || {};
  return {
    title: extractionResult({
      value: ats.title || ctx.title || null,
      confidence: computeConfidence('structured', 1, { hasEvidence: true }),
      source: 'structured',
      status: 'trusted',
      evidence: null,
      extractor: EXTRACTOR,
    }),
    company: extractionResult({
      value: ats.company || ats.company_name || ctx.company || null,
      confidence: computeConfidence('structured', 1, { hasEvidence: true }),
      source: 'structured',
      status: 'trusted',
      evidence: null,
      extractor: EXTRACTOR,
    }),
    location: extractionResult({
      value: ats.location || ctx.location || null,
      confidence: ctx.location || ats.location ? computeConfidence('structured', 0.95) : 0,
      source: 'structured',
      status: ctx.location || ats.location ? 'trusted' : 'missing',
      evidence: null,
      extractor: EXTRACTOR,
    }),
    url: extractionResult({
      value: ats.url || ctx.url || null,
      confidence: ctx.url || ats.url ? 1 : 0,
      source: 'structured',
      status: ctx.url || ats.url ? 'trusted' : 'missing',
      evidence: null,
      extractor: EXTRACTOR,
    }),
  };
}
