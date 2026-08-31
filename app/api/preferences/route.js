import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { internalError, validationError } from '@/lib/api/errors';
import {
  notificationPreferencesSchema,
  userProfileSchema,
} from '@/lib/validation/discovery';

const DEFAULT_PREFS = {
  push_enabled: true,
  max_pushes_per_day: 5,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
};

const DEFAULT_PROFILE = {
  target_job_families: [],
  target_companies: [],
  location: null,
  remote_only: false,
  is_student: false,
  timezone: 'UTC',
  min_match_score: 0.6,
};

export async function GET() {
  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const [{ data: prefs }, { data: profile }] = await Promise.all([
      supabase.from('notification_preferences').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    ]);

    return NextResponse.json({
      data: {
        notifications: prefs || { user_id: user.id, ...DEFAULT_PREFS },
        profile: profile || { user_id: user.id, ...DEFAULT_PROFILE },
      },
    });
  } catch (err) {
    console.error('GET /api/preferences', err);
    return internalError();
  }
}

export async function PATCH(request) {
  const { user, supabase, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const notifParsed = notificationPreferencesSchema.safeParse(body.notifications || body);
    const profileParsed = userProfileSchema.safeParse(body.profile || {});

    if (!notifParsed.success && body.notifications) {
      return validationError(notifParsed.error.flatten().fieldErrors);
    }
    if (body.profile && !profileParsed.success) {
      return validationError(profileParsed.error.flatten().fieldErrors);
    }

    let notifications = null;
    let profile = null;

    if (notifParsed.success && Object.keys(notifParsed.data).length) {
      const { data, error } = await supabase
        .from('notification_preferences')
        .upsert({ user_id: user.id, ...notifParsed.data }, { onConflict: 'user_id' })
        .select()
        .single();
      if (error) throw error;
      notifications = data;
    }

    if (profileParsed.success && Object.keys(profileParsed.data).length) {
      const { data, error } = await supabase
        .from('user_profiles')
        .upsert({ user_id: user.id, ...profileParsed.data }, { onConflict: 'user_id' })
        .select()
        .single();
      if (error) throw error;
      profile = data;
    }

    return NextResponse.json({ data: { notifications, profile } });
  } catch (err) {
    console.error('PATCH /api/preferences', err);
    return internalError();
  }
}
