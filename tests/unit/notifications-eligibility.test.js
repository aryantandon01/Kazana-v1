import { describe, it, expect } from 'vitest';
import { shouldNotify } from '@/lib/notifications/eligibility';
import { normalizePhone, isValidPhone } from '@/lib/notifications/phone';

const prefs = (over = {}) => ({
  push_enabled: true,
  max_pushes_per_day: 5,
  whatsapp_enabled: true,
  whatsapp_phone: '+14155550123',
  whatsapp_min_match_score: 0.7,
  whatsapp_daily_limit: 3,
  ...over,
});

describe('notification eligibility', () => {
  it('notifies for a new high-scoring match on an opted-in channel', () => {
    expect(shouldNotify({ channel: 'whatsapp', matchScore: 0.9, prefs: prefs() })).toMatchObject({ notify: true });
    expect(shouldNotify({ channel: 'push', matchScore: 0.9, prefs: prefs() })).toMatchObject({ notify: true });
  });

  it('never notifies when the user has opted out', () => {
    expect(shouldNotify({ channel: 'push', matchScore: 1, prefs: prefs({ push_enabled: false }) })).toMatchObject({
      notify: false,
      reason: 'push_disabled',
    });
    expect(shouldNotify({ channel: 'whatsapp', matchScore: 1, prefs: prefs({ whatsapp_enabled: false }) })).toMatchObject({
      notify: false,
      reason: 'whatsapp_disabled',
    });
  });

  it('requires an E.164 number for WhatsApp', () => {
    expect(shouldNotify({ channel: 'whatsapp', matchScore: 1, prefs: prefs({ whatsapp_phone: null }) })).toMatchObject({
      notify: false,
      reason: 'no_whatsapp_number',
    });
    expect(
      shouldNotify({ channel: 'whatsapp', matchScore: 1, prefs: prefs({ whatsapp_phone: '415-555-0123' }) }),
    ).toMatchObject({ notify: false, reason: 'no_whatsapp_number' });
  });

  it('respects the per-user match threshold (WhatsApp is stricter than push)', () => {
    expect(shouldNotify({ channel: 'whatsapp', matchScore: 0.69, prefs: prefs() })).toMatchObject({
      notify: false,
      reason: 'below_threshold',
    });
    expect(shouldNotify({ channel: 'whatsapp', matchScore: 0.7, prefs: prefs() }).notify).toBe(true);
    expect(shouldNotify({ channel: 'push', matchScore: 0.55, prefs: prefs() }).notify).toBe(true);
  });

  it('rejects duplicates and non-finite scores', () => {
    expect(shouldNotify({ channel: 'push', matchScore: 0.9, prefs: null, alreadyNotified: true })).toMatchObject({
      notify: false,
      reason: 'duplicate',
    });
    expect(shouldNotify({ channel: 'push', matchScore: NaN, prefs: null })).toMatchObject({
      notify: false,
      reason: 'below_threshold',
    });
  });

  it('enforces the daily limit per channel', () => {
    expect(shouldNotify({ channel: 'push', matchScore: 0.9, prefs: null, sentTodayCount: 5 })).toMatchObject({
      notify: false,
      reason: 'daily_limit_reached',
    });
    expect(shouldNotify({ channel: 'push', matchScore: 0.9, prefs: null, sentTodayCount: 4 }).notify).toBe(true);
    expect(shouldNotify({ channel: 'whatsapp', matchScore: 0.9, prefs: prefs(), sentTodayCount: 3 })).toMatchObject({
      notify: false,
      reason: 'daily_limit_reached',
    });
  });

  it('falls back to platform defaults with no prefs row (push on, WhatsApp off by default)', () => {
    expect(shouldNotify({ channel: 'push', matchScore: 0.6, prefs: null }).notify).toBe(true);
    expect(shouldNotify({ channel: 'whatsapp', matchScore: 0.99, prefs: null })).toMatchObject({
      notify: false,
      reason: 'whatsapp_disabled',
    });
  });
});

describe('phone normalisation', () => {
  it('normalises common user input to E.164', () => {
    expect(normalizePhone('+1 (415) 555-0123')).toBe('+14155550123');
    expect(normalizePhone('0014155550123')).toBe('+14155550123');
    expect(normalizePhone('  +44 7700 900123 ')).toBe('+447700900123');
  });

  it('returns null for empty input and rejects junk', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(isValidPhone('')).toBe(false);
    expect(isValidPhone('not-a-number')).toBe(false);
    // Strict: a stored value must already be canonical — never invent a '+'.
    expect(isValidPhone('4155550123')).toBe(false);
    expect(isValidPhone('415-555-0123')).toBe(false);
    expect(isValidPhone('+14155550123')).toBe(true);
  });
});
