import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

describe('notification config', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it('ships WhatsApp off by default (explicit opt-in)', async () => {
    const { NOTIFICATION_DEFAULTS, resolveChannelConfig } = await import('@/lib/notifications/config');
    expect(NOTIFICATION_DEFAULTS.whatsapp.enabled).toBe(false);
    expect(resolveChannelConfig('whatsapp', null)).toMatchObject({
      enabled: false,
      min_match_score: 0.7,
      daily_limit: 3,
    });
  });

  it('reads platform defaults from env rather than hardcoding them', async () => {
    process.env.WHATSAPP_MIN_MATCH_SCORE = '0.85';
    process.env.WHATSAPP_DAILY_LIMIT = '7';
    const { resolveChannelConfig } = await import('@/lib/notifications/config');
    expect(resolveChannelConfig('whatsapp', {})).toMatchObject({ min_match_score: 0.85, daily_limit: 7 });
  });

  it('prefers per-user preferences over platform defaults', async () => {
    process.env.WHATSAPP_MIN_MATCH_SCORE = '0.85';
    const { resolveChannelConfig } = await import('@/lib/notifications/config');
    expect(
      resolveChannelConfig('whatsapp', {
        whatsapp_enabled: true,
        whatsapp_phone: '+14155550123',
        whatsapp_min_match_score: 0.9,
        whatsapp_daily_limit: 1,
      }),
    ).toMatchObject({ enabled: true, phone: '+14155550123', min_match_score: 0.9, daily_limit: 1 });
  });

  it('maps the existing push columns onto the channel config', async () => {
    const { resolveChannelConfig } = await import('@/lib/notifications/config');
    expect(resolveChannelConfig('push', { push_enabled: false, max_pushes_per_day: 2 })).toMatchObject({
      enabled: false,
      daily_limit: 2,
    });
  });

  it('grows retry backoff exponentially and caps it', async () => {
    const { backoffSeconds, RETRY_POLICY } = await import('@/lib/notifications/config');
    expect(backoffSeconds(1)).toBe(60);
    expect(backoffSeconds(2)).toBe(120);
    expect(backoffSeconds(3)).toBe(240);
    expect(backoffSeconds(99)).toBe(RETRY_POLICY.max_delay_seconds);
    expect(RETRY_POLICY.max_delay_seconds).toBe(3600);
  });

  it('keeps the dev-only test endpoint disabled unless explicitly enabled', async () => {
    let mod = await import('@/lib/notifications/config');
    expect(mod.isTestNotificationsEnabled()).toBe(false);

    process.env.ENABLE_NOTIFICATION_TEST = 'true';
    vi.resetModules();
    mod = await import('@/lib/notifications/config');
    expect(mod.isTestNotificationsEnabled()).toBe(true);
  });
});
