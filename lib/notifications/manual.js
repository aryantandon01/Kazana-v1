/**
 * Manual WhatsApp bridge — the pre-Cloud-API delivery path.
 *
 * `notification_queue` already holds opted-in WhatsApp alert rows. Until
 * `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` are provisioned, this
 * module turns those rows into `wa.me` deep links that an operator sends from
 * the official WhatsApp app/desktop, then marks the rows sent.
 *
 * Why not automate the consumer app: unofficial automation (Baileys,
 * whatsapp-web.js) violates WhatsApp's Terms and risks a permanent ban on the
 * sender number — the one asset a business account cannot recover.
 *
 * This module is deliberately side-effect free apart from the two explicit
 * Supabase operations, so the CLI can be unit-tested with an in-memory fake.
 */

import { buildNotification } from './message.js';
import { resolveChannelConfig } from './config.js';
import { isValidPhone } from './phone.js';

/** Queue rows older than this are stale alerts; skip them unless explicitly allowed. */
export const MANUAL_STALE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `https://wa.me/<digits>?text=...` — the only deep link both mobile and
 * desktop WhatsApp understand. E.164's leading `+` must be dropped.
 */
export function buildWaLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${query}`;
}

/**
 * Same three variables as the approved Cloud API template, so the copy a user
 * receives today is identical to the copy they would receive after provisioning.
 */
export function composeWaText(notification = {}) {
  const role = notification.jobTitle || 'A new role';
  const company = notification.companyName ? ` at ${notification.companyName}` : '';
  const raw = notification.scorePercent;
  const score =
    raw === '' || raw == null || !Number.isFinite(Number(raw))
      ? ''
      : ` (${Math.round(Number(raw))}% match)`;
  return `Kazana · New match: ${role}${company}${score}`;
}

function isStale(createdAt, now, staleDays) {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false; // unknown age: fail open
  return now.getTime() - created > staleDays * DAY_MS;
}

/**
 * Read pending WhatsApp rows and resolve each one to an operable link.
 *
 * Opt-in and a valid E.164 number are re-checked here (a preference can change
 * between enqueue and manual send), mirroring `dispatch.deliver`.
 *
 * @param {object} supabaseAdmin
 * @param {{ limit?: number, includeStale?: boolean, now?: Date, staleDays?: number }} [options]
 * @returns {Promise<{
 *   items: Array<{ id: string, user_id: string, match_id: string|null, job_id: string|null,
 *                  created_at: string, phone: string, text: string, link: string }>,
 *   skipped: { disabled: number, no_phone: number, stale: number },
 *   scanned: number,
 * }>}
 */
export async function listManualWhatsAppQueue(supabaseAdmin, options = {}) {
  const {
    limit = 50,
    includeStale = false,
    now = new Date(),
    staleDays = MANUAL_STALE_DAYS,
  } = options;

  // No `scheduled_for` filter: `dispatch` defers unconfigured WhatsApp rows by an
  // hour at a time, which would make this bridge look empty at random. The
  // operator is explicitly choosing to send now.
  const { data: rows, error } = await supabaseAdmin
    .from('notification_queue')
    .select('id, user_id, match_id, job_id, channel, status, title, body, payload, created_at')
    .eq('channel', 'whatsapp')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  const queue = rows || [];
  const skipped = { disabled: 0, no_phone: 0, stale: 0 };
  if (!queue.length) return { items: [], skipped, scanned: 0 };

  const userIds = [...new Set(queue.map((row) => row.user_id))];
  const prefsMap = new Map();
  const { data: prefsRows, error: prefsError } = await supabaseAdmin
    .from('notification_preferences')
    .select('user_id, whatsapp_enabled, whatsapp_phone')
    .in('user_id', userIds);
  if (prefsError) throw new Error(prefsError.message);
  for (const prefs of prefsRows || []) prefsMap.set(prefs.user_id, prefs);

  const items = [];
  for (const row of queue) {
    const config = resolveChannelConfig('whatsapp', prefsMap.get(row.user_id) || null);

    if (!config.enabled) {
      skipped.disabled += 1;
      continue;
    }
    if (!isValidPhone(config.phone)) {
      skipped.no_phone += 1;
      continue;
    }
    if (!includeStale && isStale(row.created_at, now, staleDays)) {
      skipped.stale += 1;
      continue;
    }

    const text = composeWaText(buildNotification(row));
    items.push({
      id: row.id,
      user_id: row.user_id,
      match_id: row.match_id || null,
      job_id: row.job_id || null,
      created_at: row.created_at,
      phone: config.phone.trim(),
      text,
      link: buildWaLink(config.phone, text),
    });
  }

  return { items, skipped, scanned: queue.length };
}

/**
 * Mark manually-sent rows as sent.
 *
 * Only rows still `pending` transition, so this can never clobber a real
 * provider send (or a concurrent worker claim) that happened in the meantime.
 * `matches.notified_at` is updated exactly like `dispatch.deliver` does.
 *
 * @param {object} supabaseAdmin
 * @param {string[]} ids
 * @param {{ now?: Date }} [options]
 * @returns {Promise<{ marked: number, ids: string[] }>}
 */
export async function markManualSent(supabaseAdmin, ids, options = {}) {
  const now = options.now || new Date();
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return { marked: 0, ids: [] };

  const { data: rows, error } = await supabaseAdmin
    .from('notification_queue')
    .select('id, match_id, status')
    .in('id', unique)
    .eq('status', 'pending');
  if (error) throw new Error(error.message);

  const pending = rows || [];
  if (!pending.length) return { marked: 0, ids: [] };

  const sentAt = now.toISOString();
  const { error: updateError } = await supabaseAdmin
    .from('notification_queue')
    .update({
      status: 'sent',
      sent_at: sentAt,
      last_error: null,
      provider_message_id: `manual:${sentAt}`,
    })
    .in(
      'id',
      pending.map((row) => row.id),
    )
    .eq('status', 'pending');
  if (updateError) throw new Error(updateError.message);

  const matchIds = [...new Set(pending.map((row) => row.match_id).filter(Boolean))];
  if (matchIds.length) {
    await supabaseAdmin.from('matches').update({ notified_at: sentAt }).in('id', matchIds);
  }

  return { marked: pending.length, ids: pending.map((row) => row.id) };
}
