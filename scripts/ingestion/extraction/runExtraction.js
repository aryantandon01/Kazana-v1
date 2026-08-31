import { EXTRACTION_VERSION, IMPORTANT_FIELDS } from './types.js';
import { evaluateConfidence, mergeExtractions } from './confidence.js';
import { validateAndNormalize, toCanonical } from './validate.js';
import { buildExtractionPrompt } from './llm/prompt.js';
import { getLlmProvider } from './llm/provider.js';

import { extract as extractIdentity } from './extractors/identity.js';
import { extract as extractExperience } from './extractors/experience.js';
import {
  extractEmployment,
  extractWorkArrangement,
  extractExperienceLevel,
} from './extractors/employment.js';
import { extract as extractCareerAreas } from './extractors/careerAreas.js';
import { extract as extractSkills } from './extractors/skills.js';
import {
  extractSalary,
  extractEducation,
  extractVisa,
} from './extractors/salaryEducationVisa.js';

/**
 * Multi-stage extraction → optional one-shot LLM → merge → validate → canonical.
 *
 * @param {import('./types.js').ExtractionContext} ctx
 * @param {{ forceLlm?: boolean, threshold?: number }} [options]
 */
export async function runExtraction(ctx, options = {}) {
  const threshold =
    options.threshold ??
    (process.env.EXTRACTION_CONFIDENCE_THRESHOLD
      ? Number(process.env.EXTRACTION_CONFIDENCE_THRESHOLD)
      : 0.7);

  let fieldMap = {
    ...extractIdentity(ctx),
    ...extractExperience(ctx),
    ...extractEmployment(ctx),
    ...extractWorkArrangement(ctx),
    ...extractExperienceLevel(ctx),
    ...extractCareerAreas(ctx),
    ...extractSkills(ctx),
    ...extractSalary(ctx),
    ...extractEducation(ctx),
    ...extractVisa(ctx),
  };

  const evaluation = evaluateConfidence(fieldMap, IMPORTANT_FIELDS, threshold);
  let llmCalled = false;
  let llmModel = null;
  let llmUsage = null;

  const provider = getLlmProvider();
  if ((evaluation.needsLlm || options.forceLlm) && provider) {
    try {
      const prompt = buildExtractionPrompt(
        {
          title: ctx.title,
          company: ctx.company,
          location: ctx.location,
          description: ctx.description,
        },
        evaluation.weakFields,
      );
      const result = await provider.completeJson(prompt);
      llmCalled = true;
      llmModel = result.model;
      llmUsage = result.usage || null;
      if (result.data) {
        fieldMap = mergeExtractions(fieldMap, result.data, llmModel || 'llm');
      }
    } catch (err) {
      console.warn(
        `  LLM extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  fieldMap = validateAndNormalize(fieldMap);
  const canonical = toCanonical(fieldMap, ctx);

  return {
    canonical,
    extraction: fieldMap,
    meta: {
      version: EXTRACTION_VERSION,
      llm_called: llmCalled,
      llm_model: llmModel,
      llm_usage: llmUsage,
      weak_fields: evaluation.weakFields,
      needs_llm: evaluation.needsLlm,
      extracted_at: new Date().toISOString(),
    },
  };
}

/**
 * Build DB row patches from extraction result.
 * @param {{ canonical: import('./types.js').CanonicalJob, extraction: object, meta: object }} result
 */
export function extractionToJobPatch(result) {
  const { canonical, extraction, meta } = result;
  const min = canonical.minimumExperience;
  return {
    years_required: min,
    years_required_min: min,
    years_required_max: canonical.maximumExperience,
    job_family: canonical.jobFamily || null,
    level: canonical.legacyLevel || null,
    extraction: {
      fields: extraction,
      meta,
    },
    extraction_version: meta.version,
    extracted_at: meta.extracted_at,
  };
}
