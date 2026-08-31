/**
 * Requirement-scoped years-of-experience extraction.
 * Rejects company-growth / tenure noise ("grown 4x in the last 1 year").
 */

import { extractionResult, missingResult } from '../types.js';
import { computeConfidence } from '../confidence.js';

const EXTRACTOR = 'ExperienceExtractor';

/** Contexts that indicate the number is NOT a candidate YOE requirement. */
const FALSE_POSITIVE =
  /\b(grown|grew|growth|revenue|user base|customers?|over the (?:last|past)|in the (?:last|past)|since|founded|celebrat|anniversary|ipo|funding|raised)\b/i;

const REQUIREMENT_CUE =
  /\b(experience|experienced|minimum|at least|require[sd]?|must have|should have|looking for|candidate|qualifications?|years? of)\b/i;

/**
 * @param {import('../types.js').ExtractionContext} ctx
 * @returns {Record<string, import('../types.js').ExtractionResult>}
 */
export function extract(ctx) {
  const ats = ctx.ats || {};
  if (ats.years_required != null || ats.minimumExperience != null) {
    const min = Number(ats.minimumExperience ?? ats.years_required);
    const max =
      ats.maximumExperience != null
        ? Number(ats.maximumExperience)
        : ats.years_required_max != null
          ? Number(ats.years_required_max)
          : null;
    if (!Number.isNaN(min)) {
      return {
        minimumExperience: extractionResult({
          value: min,
          confidence: computeConfidence('structured', 1, { hasEvidence: true }),
          source: 'structured',
          status: 'trusted',
          evidence: 'ATS structured years_required',
          extractor: EXTRACTOR,
        }),
        maximumExperience:
          max != null && !Number.isNaN(max)
            ? extractionResult({
                value: max,
                confidence: computeConfidence('structured', 1, { hasEvidence: true }),
                source: 'structured',
                status: 'trusted',
                evidence: 'ATS structured years max',
                extractor: EXTRACTOR,
              })
            : missingResult(EXTRACTOR),
      };
    }
  }

  const text = `${ctx.title || ''}\n${ctx.description || ''}`;
  const sentences = splitSentences(text);
  let bestMin = null;
  let bestMax = null;
  let bestEvidence = null;
  let bestScore = 0;

  for (const sentence of sentences) {
    if (FALSE_POSITIVE.test(sentence) && !REQUIREMENT_CUE.test(sentence)) continue;

    const range = sentence.match(
      /(\d+)\s*(?:\+)?\s*(?:-|–|—|to)\s*(\d+)\s*\+?\s*years?(?:\s+of)?(?:\s+(?:relevant\s+)?experience)?/i,
    );
    if (range && isRequirementSentence(sentence)) {
      const a = parseInt(range[1], 10);
      const b = parseInt(range[2], 10);
      if (validYears(a) && validYears(b)) {
        const score = scoreSentence(sentence, 0.9);
        if (score > bestScore) {
          bestScore = score;
          bestMin = Math.min(a, b);
          bestMax = Math.max(a, b);
          bestEvidence = sentence.trim();
        }
        continue;
      }
    }

    const minPat = sentence.match(
      /(?:minimum|min\.?|at least|no less than)\s+(?:of\s+)?(\d+)\s*\+?\s*years?(?:\s+of)?(?:\s+(?:relevant\s+)?experience)?/i,
    );
    if (minPat && isRequirementSentence(sentence)) {
      const n = parseInt(minPat[1], 10);
      if (validYears(n)) {
        const score = scoreSentence(sentence, 0.92);
        if (score > bestScore) {
          bestScore = score;
          bestMin = n;
          bestMax = null;
          bestEvidence = sentence.trim();
        }
        continue;
      }
    }

    const plus = sentence.match(
      /(\d+)\s*\+\s*years?(?:\s+of\s+(?:[\w/-]+\s+){0,4})?experience/i,
    );
    if (plus && isRequirementSentence(sentence)) {
      const n = parseInt(plus[1], 10);
      if (validYears(n)) {
        const score = scoreSentence(sentence, 0.88);
        if (score > bestScore) {
          bestScore = score;
          bestMin = n;
          bestMax = null;
          bestEvidence = sentence.trim();
        }
        continue;
      }
    }

    const ofExp = sentence.match(
      /(\d+)\s*\+?\s*years?\s+of\s+(?:(?:relevant|professional|administrative|industry|hands-on|[\w-]+)\s+){0,4}experience/i,
    );
    if (ofExp && isRequirementSentence(sentence) && !FALSE_POSITIVE.test(sentence)) {
      const n = parseInt(ofExp[1], 10);
      if (validYears(n)) {
        const score = scoreSentence(sentence, 0.85);
        if (score > bestScore) {
          bestScore = score;
          bestMin = n;
          bestMax = null;
          bestEvidence = sentence.trim();
        }
      }
    }
  }

  if (bestMin == null) {
    return {
      minimumExperience: missingResult(EXTRACTOR),
      maximumExperience: missingResult(EXTRACTOR),
    };
  }

  const conf = computeConfidence('regex', bestScore, { hasEvidence: Boolean(bestEvidence) });
  return {
    minimumExperience: extractionResult({
      value: bestMin,
      confidence: conf,
      source: 'regex',
      status: conf >= 0.85 ? 'trusted' : 'ambiguous',
      evidence: bestEvidence,
      extractor: EXTRACTOR,
    }),
    maximumExperience:
      bestMax != null
        ? extractionResult({
            value: bestMax,
            confidence: conf,
            source: 'regex',
            status: conf >= 0.85 ? 'trusted' : 'ambiguous',
            evidence: bestEvidence,
            extractor: EXTRACTOR,
          })
        : missingResult(EXTRACTOR),
  };
}

function isRequirementSentence(sentence) {
  if (FALSE_POSITIVE.test(sentence) && !/\b(experience|require|qualification|candidate|must|should)\b/i.test(sentence)) {
    return false;
  }
  if (sentence.length < 80 && /(\d+)\s*\+?\s*years?/i.test(sentence)) {
    return (
      REQUIREMENT_CUE.test(sentence) ||
      /\bexperience\b/i.test(sentence) ||
      /\byears?\s+of\s+\w+/i.test(sentence)
    );
  }
  return (
    REQUIREMENT_CUE.test(sentence) ||
    /\byears?\s+of\s+(?:[\w-]+\s+){0,4}experience\b/i.test(sentence)
  );
}

function scoreSentence(sentence, base) {
  let s = base;
  if (/\b(minimum|at least|require|must have)\b/i.test(sentence)) s += 0.05;
  if (FALSE_POSITIVE.test(sentence)) s -= 0.4;
  return Math.max(0.2, Math.min(0.98, s));
}

function validYears(n) {
  return !Number.isNaN(n) && n >= 0 && n <= 40;
}

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?\n])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
