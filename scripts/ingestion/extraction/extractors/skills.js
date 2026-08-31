import { TAG_LEXICON } from '../../classification/catalog.js';
import { extractionResult, missingResult } from '../types.js';
import { computeConfidence } from '../confidence.js';
import { canonicalizeSkillName } from '../skills/normalize.js';

const EXTRACTOR = 'SkillExtractor';

/**
 * @param {import('../types.js').ExtractionContext} ctx
 */
export function extract(ctx) {
  const atsTags = [
    ...(ctx.atsTags || []),
    ...((ctx.ats && ctx.ats.tags) || []),
  ]
    .map((t) => (typeof t === 'string' ? t : t?.name || t?.slug))
    .filter(Boolean);

  const fromAts = [...new Set(atsTags.map(canonicalizeSkillName).filter(Boolean))];
  if (fromAts.length) {
    return {
      requiredSkills: extractionResult({
        value: fromAts,
        confidence: computeConfidence('structured', 0.95, { hasEvidence: true }),
        source: 'structured',
        status: 'trusted',
        evidence: 'ATS tags',
        extractor: EXTRACTOR,
      }),
      preferredSkills: missingResult(EXTRACTOR),
      technologies: extractionResult({
        value: fromAts,
        confidence: 0.9,
        source: 'structured',
        status: 'trusted',
        evidence: 'ATS tags',
        extractor: EXTRACTOR,
      }),
    };
  }

  const haystack = `${ctx.title || ''}\n${ctx.description || ''}`;
  const found = [];
  for (const entry of TAG_LEXICON) {
    if (entry.patterns.some((p) => p.test(haystack))) {
      found.push(canonicalizeSkillName(entry.name));
    }
  }

  const unique = [...new Set(found)];
  if (!unique.length) {
    return {
      requiredSkills: missingResult(EXTRACTOR),
      preferredSkills: missingResult(EXTRACTOR),
      technologies: missingResult(EXTRACTOR),
    };
  }

  const conf = computeConfidence('dictionary', 0.8, { hasEvidence: true });
  return {
    requiredSkills: extractionResult({
      value: unique,
      confidence: conf,
      source: 'dictionary',
      status: unique.length >= 2 ? 'trusted' : 'ambiguous',
      evidence: null,
      extractor: EXTRACTOR,
    }),
    preferredSkills: missingResult(EXTRACTOR),
    technologies: extractionResult({
      value: unique,
      confidence: conf,
      source: 'dictionary',
      status: 'ambiguous',
      evidence: null,
      extractor: EXTRACTOR,
    }),
  };
}
