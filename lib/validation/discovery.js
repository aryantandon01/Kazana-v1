import { z } from 'zod';

export const notificationPreferencesSchema = z.object({
  push_enabled: z.boolean().optional(),
  max_pushes_per_day: z.number().int().min(0).max(50).optional(),
  quiet_hours_start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quiet_hours_end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export const userProfileSchema = z.object({
  target_job_families: z.array(z.string()).optional(),
  target_companies: z.array(z.string()).optional(),
  location: z.string().nullable().optional(),
  remote_only: z.boolean().optional(),
  is_student: z.boolean().optional(),
  timezone: z.string().optional(),
  min_match_score: z.number().min(0).max(1).optional(),
});

export const deviceRegisterSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android', 'web']),
});
