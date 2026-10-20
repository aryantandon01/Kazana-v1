import { z } from 'zod';

/** E.164: `+`, non-zero country code, 7–15 digits total. */
export const E164_PHONE = /^\+[1-9]\d{6,14}$/;

export const notificationPreferencesSchema = z.object({
  push_enabled: z.boolean().optional(),
  max_pushes_per_day: z.number().int().min(0).max(50).optional(),
  quiet_hours_start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quiet_hours_end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  // WhatsApp channel (opt-in). `whatsapp_phone` is normalised to E.164 by the
  // API before validation; `null` clears the enrolment.
  whatsapp_enabled: z.boolean().optional(),
  whatsapp_phone: z
    .string()
    .regex(E164_PHONE, 'Phone must be in E.164 format, e.g. +14155550123')
    .nullable()
    .optional(),
  whatsapp_min_match_score: z.number().min(0).max(1).optional(),
  whatsapp_daily_limit: z.number().int().min(0).max(50).optional(),
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
