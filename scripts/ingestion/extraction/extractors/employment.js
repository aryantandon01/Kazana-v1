import {
  EMPLOYMENT_TYPE_RULES,
  EXPERIENCE_LEVEL_RULES,
  WORK_ARRANGEMENT_RULES,
  CAREER_AREA_TO_LEGACY_FAMILY,
  LEGACY_LEVEL_TO_EXPERIENCE,
} from '../../classification/catalog.js';
import { extractionResult, missingResult } from '../types.js';
import { computeConfidence } from '../confidence.js';

const EMP = 'EmploymentExtractor';
const WA = 'WorkArrangementExtractor';
const EL = 'ExperienceLevelExtractor';

/**
 * @param {import('../types.js').ExtractionContext} ctx
 */
export function extractEmployment(ctx) {
  const ats = ctx.ats || {};
  if (ats.employmentType || ats.employment_type) {
    const v = normalizeEmployment(ats.employmentType || ats.employment_type);
    if (v) {
      return {
        employmentType: extractionResult({
          value: v,
          confidence: computeConfidence('structured', 1),
          source: 'structured',
          status: 'trusted',
          evidence: 'ATS employment type',
          extractor: EMP,
        }),
      };
    }
  }

  const title = ctx.title || '';
  for (const rule of EMPLOYMENT_TYPE_RULES) {
    if (rule.patterns.some((p) => p.test(title))) {
      return {
        employmentType: extractionResult({
          value: rule.value,
          confidence: computeConfidence('regex', 0.9, { hasEvidence: true }),
          source: 'regex',
          status: 'trusted',
          evidence: title,
          extractor: EMP,
        }),
      };
    }
  }

  const body = ctx.description || '';
  for (const rule of EMPLOYMENT_TYPE_RULES) {
    if (rule.value === 'full_time') continue; // don't default from body noise
    if (rule.patterns.some((p) => p.test(body))) {
      return {
        employmentType: extractionResult({
          value: rule.value,
          confidence: computeConfidence('regex', 0.7, { hasEvidence: true }),
          source: 'regex',
          status: 'ambiguous',
          evidence: snippet(body, rule.patterns[0]),
          extractor: EMP,
        }),
      };
    }
  }

  // Soft default full_time with low confidence when nothing else matches
  return {
    employmentType: extractionResult({
      value: 'full_time',
      confidence: 0.4,
      source: 'inferred',
      status: 'inferred',
      evidence: null,
      extractor: EMP,
    }),
  };
}

/**
 * @param {import('../types.js').ExtractionContext} ctx
 */
export function extractWorkArrangement(ctx) {
  const ats = ctx.ats || {};
  if (ats.workArrangement || ats.work_arrangement) {
    const v = String(ats.workArrangement || ats.work_arrangement).toLowerCase();
    if (['remote', 'hybrid', 'onsite'].includes(v)) {
      return {
        workArrangement: extractionResult({
          value: v,
          confidence: computeConfidence('structured', 1),
          source: 'structured',
          status: 'trusted',
          evidence: 'ATS work arrangement',
          extractor: WA,
        }),
      };
    }
  }

  const titleLoc = `${ctx.title || ''}\n${ctx.location || ''}`;
  for (const rule of WORK_ARRANGEMENT_RULES) {
    if (rule.patterns.some((p) => p.test(titleLoc))) {
      return {
        workArrangement: extractionResult({
          value: rule.value,
          confidence: computeConfidence('regex', 0.9, { hasEvidence: true }),
          source: 'regex',
          status: 'trusted',
          evidence: titleLoc.trim().slice(0, 200),
          extractor: WA,
        }),
      };
    }
  }

  const body = ctx.description || '';
  for (const rule of WORK_ARRANGEMENT_RULES) {
    if (rule.patterns.some((p) => p.test(body))) {
      return {
        workArrangement: extractionResult({
          value: rule.value,
          confidence: computeConfidence('regex', 0.72, { hasEvidence: true }),
          source: 'regex',
          status: 'ambiguous',
          evidence: snippet(body, rule.patterns[0]),
          extractor: WA,
        }),
      };
    }
  }

  return { workArrangement: missingResult(WA) };
}

/**
 * Title-first experience level (same priority as improved classifier).
 * @param {import('../types.js').ExtractionContext} ctx
 */
export function extractExperienceLevel(ctx) {
  const title = ctx.title || '';
  for (const rule of EXPERIENCE_LEVEL_RULES) {
    if (rule.patterns.some((p) => p.test(title))) {
      return {
        experienceLevel: extractionResult({
          value: rule.value,
          confidence: computeConfidence('regex', 0.92, { hasEvidence: true }),
          source: 'regex',
          status: 'trusted',
          evidence: title,
          extractor: EL,
        }),
        legacyLevel: extractionResult({
          value: experienceToLegacy(rule.value),
          confidence: 0.85,
          source: 'inferred',
          status: 'inferred',
          evidence: title,
          extractor: EL,
        }),
      };
    }
  }

  // Body only for intern/new_grad/entry/senior explicit phrases — skip noisy mid
  const body = (ctx.description || '').slice(0, 3000);
  for (const rule of EXPERIENCE_LEVEL_RULES) {
    if (['mid'].includes(rule.value)) continue;
    if (rule.patterns.some((p) => p.test(body))) {
      return {
        experienceLevel: extractionResult({
          value: rule.value,
          confidence: computeConfidence('regex', 0.65, { hasEvidence: true }),
          source: 'regex',
          status: 'ambiguous',
          evidence: snippet(body, rule.patterns[0]),
          extractor: EL,
        }),
        legacyLevel: missingResult(EL),
      };
    }
  }

  return {
    experienceLevel: missingResult(EL),
    legacyLevel: missingResult(EL),
  };
}

function normalizeEmployment(raw) {
  const s = String(raw).toLowerCase().replace(/[-\s]+/g, '_');
  if (s.includes('intern')) return 'internship';
  if (s.includes('contract') || s.includes('freelance')) return 'contract';
  if (s.includes('part')) return 'part_time';
  if (s.includes('temp')) return 'temporary';
  if (s.includes('full')) return 'full_time';
  return null;
}

function experienceToLegacy(value) {
  const map = {
    intern: 'L1',
    new_grad: 'L2',
    entry: 'L3',
    mid: 'L4',
    senior: 'L5',
    staff: 'L6',
    principal: 'L7',
    director: 'L8',
  };
  return map[value] || null;
}

function snippet(text, pattern) {
  const m = text.match(pattern);
  if (!m || m.index == null) return text.slice(0, 120);
  const start = Math.max(0, m.index - 40);
  return text.slice(start, start + 160).trim();
}

export { CAREER_AREA_TO_LEGACY_FAMILY, LEGACY_LEVEL_TO_EXPERIENCE };
