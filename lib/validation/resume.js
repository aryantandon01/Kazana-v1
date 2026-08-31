import { z } from 'zod';

export const resumeCreateSchema = z.object({
  companies: z.array(z.string().min(1)).min(1),
  job_family: z.string().min(1),
  level: z.string().min(1),
  years_of_experience: z.coerce.number().int().min(0),
  country: z.string().min(1, 'Country is required'),
  university: z.string().nullable().optional(),
  name: z.string().optional(),
  file_url: z.string().url(),
  file_path: z.string().min(1),
});

export const resumeUpdateSchema = z.object({
  companies: z.array(z.string().min(1)).min(1).optional(),
  job_family: z.string().min(1).optional(),
  level: z.string().min(1).optional(),
  years_of_experience: z.coerce.number().int().min(0).optional(),
  country: z.string().nullable().optional(),
  university: z.string().nullable().optional(),
  name: z.string().optional(),
  file_url: z.string().url().optional(),
  file_path: z.string().min(1).optional(),
});

export const uploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().default('application/pdf'),
});
