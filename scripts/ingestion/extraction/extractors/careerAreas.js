import {
  CAREER_AREA_RULES,
  CAREER_AREA_TO_LEGACY_FAMILY,
  BODY_SAFE_FAMILY_AREAS,
} from '../../classification/catalog.js';
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
    // `titleOnly` rules (bare "AI") are far too weak in bodies to classify a job.
    if (rule.titleOnly) continue;
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

  // Title evidence always wins, and a concrete title area (sales, legal,
  // engineering…) beats a generic "AI" token inside the title. When the title
  // says nothing, only high-precision technical body areas may decide the
  // family — "AI", "compliance", "revenue" and "growth" never do.
  const titleHit = hits.find((h) => h.title && h.value !== 'ai') || hits.find((h) => h.title);
  const bodyHit = hits.find((h) => !h.title && BODY_SAFE_FAMILY_AREAS.has(h.value)) || null;
  const primaryHit = titleHit || bodyHit || null;
  const primary = primaryHit?.value ?? null;

  // Keep the primary value first for consumers that read `[0]`.
  const values = [];
  if (primary) values.push(primary);
  for (const hit of hits) {
    if (!values.includes(hit.value)) values.push(hit.value);
  }

  if (!values.length) {
    return {
      careerAreas: missingResult(EXTRACTOR),
      jobFamily: missingResult(EXTRACTOR),
    };
  }

  const conf = primaryHit?.confidence ?? hits[0]?.confidence ?? 0.7;
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
      evidence: primaryHit?.evidence || null,
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
