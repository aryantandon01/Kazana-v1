/**
 * Central configuration for the notification pipeline.
 *
 * Platform defaults live here and ONLY here — per-user overrides live in
 * `notification_preferences`. Do not hard-code thresholds, daily limits or
 * retry behaviour anywhere else; import them from this module so a single
 * change (or env var) reconfigures the whole pipeline.
 */

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === '1' || value === 'true';
}

/** Channels the pipeline can enqueue/deliver. `email` is reserved (no provider yet). */
export const NOTIFICATION_CHANNELS = ['push', 'whatsapp'];
export const NOTIFICATION_TYPES = ['job_match'];

/**
 * Platform-wide defaults, keyed by channel. Env-overridable so staging and
 * production can diverge without code changes.
 */
export const NOTIFICATION_DEFAULTS = {
  push: {
    enabled: true,
    // Matches DEFAULT_MIN_SCORE in lib/matching/score.js — a "match" is pushable.
    min_match_score: num(process.env.PUSH_MIN_MATCH_SCORE, 0.5),
    daily_limit: 5,
  },
  whatsapp: {
    // Off by default: WhatsApp is explicit opt-in (the user must add a number).
    enabled: bool(process.env.WHATSAPP_ENABLED_BY_DEFAULT, false),
    min_match_score: num(process.env.WHATSAPP_MIN_MATCH_SCORE, 0.7),
    daily_limit: num(process.env.WHATSAPP_DAILY_LIMIT, 3),
  },
};

/** Retry/backoff policy for the notification worker. */
export const RETRY_POLICY = {
  max_attempts: num(process.env.NOTIFICATION_MAX_ATTEMPTS, 4),
  base_delay_seconds: num(process.env.NOTIFICATION_RETRY_BASE_SECONDS, 60),
  max_delay_seconds: num(process.env.NOTIFICATION_RETRY_MAX_SECONDS, 3600),
};

/** A 'processing' row older than this is assumed abandoned and released. */
export const PROCESSING_TIMEOUT_SECONDS = num(process.env.NOTIFICATION_PROCESSING_TIMEOUT_SECONDS, 600);

/** Exponential backoff: base * 2^(attempts-1), capped at max_delay_seconds. */
export function backoffSeconds(attempts) {
  const { base_delay_seconds, max_delay_seconds } = RETRY_POLICY;
  const n = Math.max(1, Number(attempts) || 1);
  return Math.min(base_delay_seconds * 2 ** (n - 1), max_delay_seconds);
}

export function channelDefaults(channel) {
  return NOTIFICATION_DEFAULTS[channel] || { enabled: false, min_match_score: 1, daily_limit: 0 };
}

/**
 * Resolve a user's effective config for a channel, falling back to platform
 * defaults when the user has no `notification_preferences` row.
 */
export function resolveChannelConfig(channel, prefs) {
  const defaults = channelDefaults(channel);
  if (!prefs) return { ...defaults };

  if (channel === 'push') {
    return {
      enabled: prefs.push_enabled ?? defaults.enabled,
      min_match_score: defaults.min_match_score,
      daily_limit: prefs.max_pushes_per_day ?? defaults.daily_limit,
    };
  }

  if (channel === 'whatsapp') {
    return {
      enabled: prefs.whatsapp_enabled ?? defaults.enabled,
      min_match_score: prefs.whatsapp_min_match_score ?? defaults.min_match_score,
      daily_limit: prefs.whatsapp_daily_limit ?? defaults.daily_limit,
      phone: prefs.whatsapp_phone || null,
    };
  }

  return { ...defaults };
}

/**
 * Dev-safe test endpoint flag. Off unless explicitly enabled — the endpoint
 * must never be able to spam real recipients in production.
 */
export function isTestNotificationsEnabled() {
  return bool(process.env.ENABLE_NOTIFICATION_TEST, false);
}
