/**
 * Canonical extraction types for the AI-assisted ETL pipeline.
 */

/** @typedef {'structured'|'regex'|'dictionary'|'llm'|'inferred'} ExtractionSource */
/** @typedef {'trusted'|'ambiguous'|'missing'|'inferred'} ExtractionStatus */

/**
 * @typedef {object} ExtractionResult
 * @property {*} value
 * @property {number} confidence 0..1
 * @property {ExtractionSource} source
 * @property {ExtractionStatus} status
 * @property {string|null} evidence
 * @property {string} extractor
 */

/**
 * @typedef {object} CanonicalJob
 * @property {string} title
 * @property {string} company
 * @property {string|null} location
 * @property {string|null} [url]
 * @property {string|null} employmentType
 * @property {string|null} workArrangement
 * @property {number|null} minimumExperience
 * @property {number|null} maximumExperience
 * @property {string|null} experienceLevel
 * @property {string[]} requiredSkills
 * @property {string[]} preferredSkills
 * @property {string[]} technologies
 * @property {string[]} careerAreas
 * @property {string|null} education
 * @property {{ currency?: string, min?: number, max?: number, period?: string }|null} salary
 * @property {boolean|null} visaSponsorship
 * @property {string[]|null} [responsibilities]
 * @property {string|null} [jobFamily]
 * @property {string|null} [legacyLevel]
 */

/**
 * @typedef {object} ExtractionContext
 * @property {string} title
 * @property {string|null} description
 * @property {string|null} location
 * @property {string|null} [company]
 * @property {string|null} [url]
 * @property {object} [ats] Structured ATS fields when available
 * @property {object|null} [rawPayload]
 * @property {string[]} [atsTags]
 */

/**
 * @param {Partial<ExtractionResult> & { value: *, extractor: string }} partial
 * @returns {ExtractionResult}
 */
export function extractionResult(partial) {
  const confidence = clamp01(partial.confidence ?? 0);
  const status =
    partial.status ||
    (partial.value == null || (Array.isArray(partial.value) && !partial.value.length)
      ? 'missing'
      : confidence >= 0.85
        ? 'trusted'
        : confidence >= 0.5
          ? 'ambiguous'
          : 'inferred');

  return {
    value: partial.value ?? null,
    confidence,
    source: partial.source || 'regex',
    status,
    evidence: partial.evidence ?? null,
    extractor: partial.extractor,
  };
}

export function missingResult(extractor) {
  return extractionResult({
    value: null,
    confidence: 0,
    source: 'regex',
    status: 'missing',
    evidence: null,
    extractor,
  });
}

function clamp01(n) {
  return Math.min(1, Math.max(0, Number(n) || 0));
}

export const EXTRACTION_VERSION = 'v1';

export const IMPORTANT_FIELDS = [
  'minimumExperience',
  'careerAreas',
  'requiredSkills',
  'employmentType',
  'workArrangement',
  'experienceLevel',
];

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'temporary'];
export const WORK_ARRANGEMENTS = ['remote', 'hybrid', 'onsite'];
export const EXPERIENCE_LEVELS = [
  'intern',
  'new_grad',
  'entry',
  'mid',
  'senior',
  'staff',
  'principal',
  'director',
];
