import { Expo } from 'expo-server-sdk';
import { getAdminClient } from '../supabase/admin.js';

const expo = new Expo();

function isQuietHours(prefs) {
  if (!prefs?.quiet_hours_start || !prefs?.quiet_hours_end) return false;
  const now = new Date();
  const [sh, sm] = prefs.quiet_hours_start.split(':').map(Number);
  const [eh, em] = prefs.quiet_hours_end.split(':').map(Number);
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const start = sh * 60 + (sm || 0);
  const end = eh * 60 + (em || 0);
  if (start <= end) return mins >= start && mins < end;
  return mins >= start || mins < end;
}

export async function runNotifications({ limit = 50 } = {}) {
  const supabaseAdmin = getAdminClient();

  const { data: pending, error } = await supabaseAdmin
    .from('notification_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  if (!pending?.length) {
    return { sent: 0, skipped: 0, failed: 0 };
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of pending) {
    const { data: prefs } = await supabaseAdmin
      .from('notification_preferences')
      .select('*')
      .eq('user_id', row.user_id)
      .maybeSingle();

    if (prefs && !prefs.push_enabled) {
      await skip(supabaseAdmin, row.id, 'push_disabled');
      skipped += 1;
      continue;
    }

    if (isQuietHours(prefs)) {
      await skip(supabaseAdmin, row.id, 'quiet_hours');
      skipped += 1;
      continue;
    }

    const { data: tokens } = await supabaseAdmin
      .from('device_tokens')
      .select('token')
      .eq('user_id', row.user_id)
      .eq('is_active', true);

    const validTokens = (tokens || [])
      .map((t) => t.token)
      .filter((t) => Expo.isExpoPushToken(t));

    if (!validTokens.length) {
      await skip(supabaseAdmin, row.id, 'no_device_token');
      skipped += 1;
      continue;
    }

    const messages = validTokens.map((token) => ({
      to: token,
      sound: 'default',
      title: row.title,
      body: row.body,
      data: row.payload,
    }));

    try {
      for (const chunk of expo.chunkPushNotifications(messages)) {
        await expo.sendPushNotificationsAsync(chunk);
      }

      await supabaseAdmin
        .from('notification_queue')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', row.id);

      if (row.match_id) {
        await supabaseAdmin
          .from('matches')
          .update({ notified_at: new Date().toISOString() })
          .eq('id', row.match_id);
      }

      sent += 1;
    } catch (err) {
      await supabaseAdmin
        .from('notification_queue')
        .update({
          status: 'failed',
          attempts: row.attempts + 1,
          last_error: err.message,
        })
        .eq('id', row.id);
      failed += 1;
    }
  }

  return { sent, skipped, failed };
}

async function skip(supabase, id, reason) {
  await supabase
    .from('notification_queue')
    .update({ status: 'skipped', last_error: reason })
    .eq('id', id);
}
