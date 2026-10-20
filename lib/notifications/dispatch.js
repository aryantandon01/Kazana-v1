import { getAdminClient } from '../supabase/admin.js';
import { getProvider, isExpoPushToken, isWhatsAppConfigured } from './providers/index.js';
import { describeRecipient } from './providers/provider.js';
import {
  PROCESSING_TIMEOUT_SECONDS,
  RETRY_POLICY,
  backoffSeconds,
  resolveChannelConfig,
} from './config.js';
import { isValidPhone } from './phone.js';
import { buildNotification } from './message.js';

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

function log(event, fields) {
  // Structured, PII-free observability: ids, channel and reasons only.
  console.log(`[notifications] ${event}`, JSON.stringify(fields));
}

/** Reset rows left in 'processing' by a crashed or timed-out worker. */
async function releaseStuckProcessing(supabaseAdmin) {
  const cutoff = new Date(Date.now() - PROCESSING_TIMEOUT_SECONDS * 1000).toISOString();
  await supabaseAdmin
    .from('notification_queue')
    .update({ status: 'pending', last_error: 'released_stuck_processing' })
    .eq('status', 'processing')
    .lt('updated_at', cutoff);
}

/** Atomically claim a pending row so concurrent workers never double-send. */
async function claim(supabaseAdmin, id) {
  const { data } = await supabaseAdmin
    .from('notification_queue')
    .update({ status: 'processing' })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  return Boolean(data);
}

async function mark(supabaseAdmin, id, patch) {
  await supabaseAdmin.from('notification_queue').update(patch).eq('id', id);
}

/**
 * Drain the notification queue across every channel.
 * @param {{ limit?: number }} [options]
 * @returns {Promise<{ sent: number, skipped: number, failed: number, deferred: number }>}
 */
export async function runNotifications({ limit = 50 } = {}) {
  const supabaseAdmin = getAdminClient();

  await releaseStuckProcessing(supabaseAdmin);

  const { data: pending, error } = await supabaseAdmin
    .from('notification_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  if (!pending?.length) {
    return { sent: 0, skipped: 0, failed: 0, deferred: 0 };
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let deferred = 0;

  for (const row of pending) {
    const channel = row.channel || 'push';

    // Claim first: a competing worker's claim makes this a no-op.
    if (!(await claim(supabaseAdmin, row.id))) continue;

    const { data: prefs } = await supabaseAdmin
      .from('notification_preferences')
      .select('*')
      .eq('user_id', row.user_id)
      .maybeSingle();

    const outcome = await deliver(supabaseAdmin, row, channel, prefs);
    if (outcome === 'sent') sent += 1;
    else if (outcome === 'skipped') skipped += 1;
    else if (outcome === 'failed') failed += 1;
    else deferred += 1;
  }

  return { sent, skipped, failed, deferred };
}

function isPermanentProviderError(err) {
  const status = Number(err?.status);
  if (Number.isFinite(status) && status >= 400 && status < 500 && status !== 429) return true;
  const message = String(err?.message || '').toLowerCase();
  return message.includes('missing_recipient') || message.includes('no_device_token');
}

/** Channel-specific recipient: Expo tokens for push, a validated E.164 number for WhatsApp. */
async function resolveRecipient(supabaseAdmin, channel, row, prefs) {
  if (channel === 'whatsapp') {
    // Strict: the stored number must already be canonical. Never guess a `+`.
    const phone = prefs?.whatsapp_phone;
    return isValidPhone(phone) ? phone.trim() : null;
  }

  if (channel === 'push') {
    const { data: tokens } = await supabaseAdmin
      .from('device_tokens')
      .select('token')
      .eq('user_id', row.user_id)
      .eq('is_active', true);
    const valid = (tokens || []).map((t) => t.token).filter((t) => isExpoPushToken(t));
    return valid.length ? valid : null;
  }

  return null;
}

/**
 * Deliver a single claimed row and move it to its next state.
 * @returns {Promise<'sent'|'skipped'|'failed'|'deferred'>}
 */
async function deliver(supabaseAdmin, row, channel, prefs) {
  const config = resolveChannelConfig(channel, prefs);

  // 1. Opt-out (may have changed since the row was enqueued).
  if (!config.enabled) {
    await mark(supabaseAdmin, row.id, { status: 'skipped', last_error: `${channel}_disabled` });
    return 'skipped';
  }

  // 2. Platform not configured yet — defer without burning retries.
  if (channel === 'whatsapp' && !isWhatsAppConfigured()) {
    await mark(supabaseAdmin, row.id, {
      status: 'pending',
      scheduled_for: new Date(Date.now() + RETRY_POLICY.max_delay_seconds * 1000).toISOString(),
      last_error: 'whatsapp_not_configured',
    });
    return 'deferred';
  }

  // 3. Quiet hours.
  if (isQuietHours(prefs)) {
    await mark(supabaseAdmin, row.id, { status: 'skipped', last_error: 'quiet_hours' });
    return 'skipped';
  }

  // 4. Recipient must exist and be valid for the channel.
  const recipient = await resolveRecipient(supabaseAdmin, channel, row, prefs);
  if (!recipient) {
    await mark(supabaseAdmin, row.id, { status: 'skipped', last_error: `${channel}_no_recipient` });
    return 'skipped';
  }

  let provider;
  try {
    provider = getProvider(channel);
  } catch (err) {
    await mark(supabaseAdmin, row.id, {
      status: 'failed',
      attempts: (row.attempts || 0) + 1,
      last_error: err.message,
    });
    return 'failed';
  }

  try {
    const { messageId } = await provider.send({ to: recipient, notification: buildNotification(row) });

    await mark(supabaseAdmin, row.id, {
      status: 'sent',
      sent_at: new Date().toISOString(),
      provider_message_id: messageId || null,
      last_error: null,
    });

    if (row.match_id) {
      await supabaseAdmin
        .from('matches')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', row.match_id);
    }

    log('sent', {
      notificationId: row.id,
      userId: row.user_id,
      jobId: row.job_id,
      channel,
      recipient: describeRecipient(recipient),
      providerMessageId: messageId || null,
    });
    return 'sent';
  } catch (err) {
    const attempts = (row.attempts || 0) + 1;
    const permanent = isPermanentProviderError(err);
    log('send_failed', {
      notificationId: row.id,
      userId: row.user_id,
      channel,
      attempts,
      permanent,
      error: err.message,
    });

    if (permanent || attempts >= RETRY_POLICY.max_attempts) {
      await mark(supabaseAdmin, row.id, { status: 'failed', attempts, last_error: err.message });
      return 'failed';
    }

    await mark(supabaseAdmin, row.id, {
      status: 'pending',
      attempts,
      last_error: err.message,
      scheduled_for: new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString(),
    });
    return 'deferred';
  }
}
