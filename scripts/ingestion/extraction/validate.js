import {
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  WORK_ARRANGEMENTS,
  extractionResult,
} from './types.js';
import { normalizeSkillSlug, canonicalizeSkillName } from './skills/normalize.js';

/**
 * Validate and normalize a field map in place; invalid values → missing/low confidence.
 * @param {Record<string, import('./types.js').ExtractionResult>} fieldMap
 */
export function validateAndNormalize(fieldMap) {
  clampYears(fieldMap, 'minimumExperience');
  clampYears(fieldMap, 'maximumExperience');

  if (
    fieldMap.minimumExperience?.value != null &&
    fieldMap.maximumExperience?.value != null &&
    fieldMap.maximumExperience.value < fieldMap.minimumExperience.value
  ) {
    fieldMap.maximumExperience = {
      ...fieldMap.maximumExperience,
      value: fieldMap.minimumExperience.value,
      confidence: Math.min(fieldMap.maximumExperience.confidence, 0.6),
      status: 'ambiguous',
    };
  }

  enumField(fieldMap, 'employmentType', EMPLOYMENT_TYPES);
  enumField(fieldMap, 'workArrangement', WORK_ARRANGEMENTS);
  enumField(fieldMap, 'experienceLevel', EXPERIENCE_LEVELS);

  normalizeSkillArray(fieldMap, 'requiredSkills');
  normalizeSkillArray(fieldMap, 'preferredSkills');
  normalizeSkillArray(fieldMap, 'technologies');

  if (fieldMap.careerAreas?.value) {
    const areas = Array.isArray(fieldMap.careerAreas.value)
      ? fieldMap.careerAreas.value.map((a) => String(a).toLowerCase().replace(/\s+/g, '_'))
      : [];
    fieldMap.careerAreas = {
      ...fieldMap.careerAreas,
      value: [...new Set(areas.filter(Boolean))],
    };
  }

  if (fieldMap.salary?.value) {
    const s = fieldMap.salary.value;
    if (s.min != null && s.min < 0) {
      fieldMap.salary = extractionResult({
        value: null,
        confidence: 0,
        status: 'missing',
        extractor: fieldMap.salary.extractor,
        source: fieldMap.salary.source,
      });
    }
  }

  return fieldMap;
}

function clampYears(fieldMap, key) {
  const r = fieldMap[key];
  if (!r || r.value == null) return;
  const n = Number(r.value);
  if (Number.isNaN(n) || n < 0 || n > 40) {
    fieldMap[key] = {
      ...r,
      value: null,
      confidence: 0,
      status: 'missing',
      evidence: r.evidence,
    };
  } else {
    fieldMap[key] = { ...r, value: Math.round(n) };
  }
}

function enumField(fieldMap, key, allowed) {
  const r = fieldMap[key];
  if (!r || r.value == null) return;
  const v = String(r.value);
  if (!allowed.includes(v)) {
    fieldMap[key] = {
      ...r,
      value: null,
      confidence: 0,
      status: 'missing',
    };
  }
}

function normalizeSkillArray(fieldMap, key) {
  const r = fieldMap[key];
  if (!r || !Array.isArray(r.value)) return;
  const seen = new Set();
  const out = [];
  for (const raw of r.value) {
    const slug = normalizeSkillSlug(raw);
    const name = canonicalizeSkillName(raw);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(name);
  }
  fieldMap[key] = { ...r, value: out };
}

/**
 * Flatten ExtractionResult map → CanonicalJob plain values.
 * @param {Record<string, import('./types.js').ExtractionResult>} fieldMap
 * @param {import('./types.js').ExtractionContext} ctx
 */
export function toCanonical(fieldMap, ctx) {
  const v = (key, fallback = null) =>
    fieldMap[key]?.value != null ? fieldMap[key].value : fallback;

  return {
    title: v('title', ctx.title),
    company: v('company', ctx.company || null),
    location: v('location', ctx.location),
    url: v('url', ctx.url || null),
    employmentType: v('employmentType'),
    workArrangement: v('workArrangement'),
    minimumExperience: v('minimumExperience'),
    maximumExperience: v('maximumExperience'),
    experienceLevel: v('experienceLevel'),
    requiredSkills: v('requiredSkills') || [],
    preferredSkills: v('preferredSkills') || [],
    technologies: v('technologies') || [],
    careerAreas: v('careerAreas') || [],
    education: v('education'),
    salary: v('salary'),
    visaSponsorship: v('visaSponsorship'),
    responsibilities: v('responsibilities'),
    jobFamily: v('jobFamily'),
    legacyLevel: v('legacyLevel'),
  };
}
