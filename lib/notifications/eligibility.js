/**
 * Pure notification-eligibility decisions.
 *
 * Kept dependency-free so the rules that decide *whether a user is messaged*
 * can be unit-tested exhaustively. Callers are responsible for supplying the
 * inputs (prefs row, match score, duplicate flag, today's send count).
 */

import { resolveChannelConfig } from './config.js';
import { isValidPhone } from './phone.js';

/**
 * Should the user be notified about this job over this channel?
 *
 * Order matters: opt-out and missing-recipient short-circuit before the
 * score/limit checks so the returned `reason` is the most actionable one.
 *
 * @param {object} input
 * @param {'push'|'whatsapp'} input.channel
 * @param {number} input.matchScore             match score in [0, 1]
 * @param {object|null} input.prefs             notification_preferences row
 * @param {boolean} [input.alreadyNotified]     a notification already exists for (user, job, channel)
 * @param {number} [input.sentTodayCount]       notifications already queued/sent for this channel in 24h
 * @returns {{ notify: boolean, reason?: string, config: object }}
 */
export function shouldNotify({
  channel,
  matchScore,
  prefs,
  alreadyNotified = false,
  sentTodayCount = 0,
}) {
  const config = resolveChannelConfig(channel, prefs);

  if (!config.enabled) {
    return { notify: false, reason: `${channel}_disabled`, config };
  }

  if (channel === 'whatsapp' && !isValidPhone(config.phone)) {
    return { notify: false, reason: 'no_whatsapp_number', config };
  }

  if (alreadyNotified) {
    return { notify: false, reason: 'duplicate', config };
  }

  if (!Number.isFinite(matchScore) || matchScore < config.min_match_score) {
    return { notify: false, reason: 'below_threshold', config };
  }

  if (sentTodayCount >= config.daily_limit) {
    return { notify: false, reason: 'daily_limit_reached', config };
  }

  return { notify: true, config };
}
