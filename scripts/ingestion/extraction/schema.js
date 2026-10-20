import { z } from 'zod';
import { EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, WORK_ARRANGEMENTS } from './types.js';

/** LLM / merge target — null means unknown (do not invent). */
export const canonicalJobSchema = z.object({
  title: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).nullable().optional(),
  workArrangement: z.enum(WORK_ARRANGEMENTS).nullable().optional(),
  minimumExperience: z.number().int().min(0).max(40).nullable().optional(),
  maximumExperience: z.number().int().min(0).max(40).nullable().optional(),
  experienceLevel: z.enum(EXPERIENCE_LEVELS).nullable().optional(),
  requiredSkills: z.array(z.string()).nullable().optional(),
  preferredSkills: z.array(z.string()).nullable().optional(),
  technologies: z.array(z.string()).nullable().optional(),
  careerAreas: z.array(z.string()).nullable().optional(),
  education: z.string().nullable().optional(),
  salary: z
    .object({
      currency: z.string().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      period: z.string().optional(),
    })
    .nullable()
    .optional(),
  visaSponsorship: z.boolean().nullable().optional(),
  responsibilities: z.array(z.string()).nullable().optional(),
});

/**
 * One item in a batched extraction response — the canonical single-job shape
 * plus the routing key echoed back by the model.
 */
export const batchExtractionItemSchema = canonicalJobSchema.extend({
  // Models sometimes emit numeric ATS ids as JSON numbers — accept both.
  external_id: z.union([z.string(), z.number()]),
});

/**
 * Top-level shape of a batched extraction response:
 * `{ "items": [{ "external_id": "...", ...canonical fields }] }`.
 */
export const batchExtractionResponseSchema = z.object({
  items: z.array(batchExtractionItemSchema),
});

export const extractionResultSchema = z.object({
  value: z.any(),
  confidence: z.number().min(0).max(1),
  source: z.enum(['structured', 'regex', 'dictionary', 'llm', 'inferred']),
  status: z.enum(['trusted', 'ambiguous', 'missing', 'inferred']),
  evidence: z.string().nullable(),
  extractor: z.string(),
});
