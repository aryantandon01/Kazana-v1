import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  getProvider: vi.fn(),
  isWhatsAppConfigured: vi.fn(),
  isExpoPushToken: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: mocks.getAdminClient }));
vi.mock('@/lib/notifications/providers/index.js', () => ({
  getProvider: mocks.getProvider,
  isWhatsAppConfigured: mocks.isWhatsAppConfigured,
  isExpoPushToken: mocks.isExpoPushToken,
}));

import { runNotifications } from '@/lib/notifications/dispatch';

const USER = 'user-1';

/** Minimal in-memory stand-in for the Supabase admin client. */
const db = { queue: [], prefs: new Map(), devices: [], matches: [] };

function fakeAdmin() {
  return {
    from(table) {
      const q = { table, op: 'select', filters: [], patch: null, single: false };

      const tableRows = () => {
        if (table === 'notification_queue') return db.queue;
        if (table === 'notification_preferences') return [...db.prefs.values()];
        if (table === 'device_tokens') return db.devices;
        if (table === 'matches') return db.matches;
        return [];
      };

      const matches = (row) =>
        q.filters.every(([op, col, val]) => {
          if (op === 'eq') return row[col] === val;
          if (op === 'lte') return String(row[col]) <= String(val);
          if (op === 'lt') return String(row[col]) < String(val);
          if (op === 'gte') return String(row[col]) >= String(val);
          return true;
        });

      const execute = () => {
        const rows = tableRows().filter(matches);
        if (q.op === 'update') for (const row of rows) Object.assign(row, q.patch);
        return { data: q.single ? rows[0] || null : rows, error: null, count: rows.length };
      };

      const api = {
        select: () => api,
        insert: (values) => {
          q.op = 'insert';
          q.patch = values;
          return api;
        },
        update: (patch) => {
          q.op = 'update';
          q.patch = patch;
          return api;
        },
        upsert: (values) => {
          q.op = 'upsert';
          q.patch = values;
          return api;
        },
        eq: (col, val) => {
          q.filters.push(['eq', col, val]);
          return api;
        },
        lte: (col, val) => {
          q.filters.push(['lte', col, val]);
          return api;
        },
        lt: (col, val) => {
          q.filters.push(['lt', col, val]);
          return api;
        },
        gte: (col, val) => {
          q.filters.push(['gte', col, val]);
          return api;
        },
        in: (col, val) => {
          q.filters.push(['in', col, val]);
          return api;
        },
        order: () => api,
        limit: () => api,
        range: () => api,
        maybeSingle: () => {
          q.single = true;
          return Promise.resolve(execute());
        },
        single: () => {
          q.single = true;
          return Promise.resolve(execute());
        },
        then: (resolve, reject) => {
          try {
            resolve(execute());
          } catch (err) {
            reject(err);
          }
        },
      };

      return api;
    },
  };
}

function setPrefs(over = {}) {
  db.prefs.set(USER, {
    user_id: USER,
    push_enabled: true,
    max_pushes_per_day: 5,
    quiet_hours_start: null,
    quiet_hours_end: null,
    whatsapp_enabled: true,
    whatsapp_phone: '+14155550123',
    whatsapp_min_match_score: 0.7,
    whatsapp_daily_limit: 3,
    ...over,
  });
}

function seedQueue(over = {}) {
  const row = {
    id: 'n1',
    user_id: USER,
    match_id: 'm1',
    job_id: 'j1',
    channel: 'whatsapp',
    type: 'job_match',
    title: 'New match: Stripe',
    body: 'Backend Engineer — score 92%',
    payload: { score: 0.92, job_title: 'Backend Engineer', company_name: 'Stripe' },
    status: 'pending',
    attempts: 0,
    scheduled_for: new Date(Date.now() - 60_000).toISOString(),
    updated_at: new Date(Date.now() - 60_000).toISOString(),
    ...over,
  };
  db.queue = [row];
  return row;
}

describe('notification dispatch', () => {
  beforeEach(() => {
    db.queue = [];
    db.prefs = new Map();
    db.devices = [];
    db.matches = [{ id: 'm1', user_id: USER, notified_at: null }];
    mocks.getAdminClient.mockReturnValue(fakeAdmin());
    mocks.isWhatsAppConfigured.mockReturnValue(true);
    mocks.isExpoPushToken.mockReturnValue(true);
    mocks.getProvider.mockReset();
  });

  it('is a no-op on an empty queue', async () => {
    await expect(runNotifications()).resolves.toEqual({ sent: 0, skipped: 0, failed: 0, deferred: 0 });
  });

  it('claims the row, sends, and persists the provider message id', async () => {
    setPrefs();
    const row = seedQueue();
    let statusWhenSent = null;
    const send = vi.fn().mockImplementation(() => {
      statusWhenSent = row.status;
      return Promise.resolve({ messageId: 'wamid.1' });
    });
    mocks.getProvider.mockReturnValue({ channel: 'whatsapp', send });

    const result = await runNotifications();

    expect(result).toEqual({ sent: 1, skipped: 0, failed: 0, deferred: 0 });
    expect(statusWhenSent).toBe('processing'); // claimed before delivery
    expect(mocks.getProvider).toHaveBeenCalledWith('whatsapp');
    expect(send).toHaveBeenCalledWith({
      to: '+14155550123',
      notification: expect.objectContaining({
        jobTitle: 'Backend Engineer',
        companyName: 'Stripe',
        scorePercent: 92,
      }),
    });
    expect(row).toMatchObject({ status: 'sent', provider_message_id: 'wamid.1', last_error: null });
    expect(row.sent_at).toBeTruthy();
    expect(db.matches[0].notified_at).toBeTruthy();
  });

  it('skips rows whose owner opted out after enqueueing', async () => {
    setPrefs({ whatsapp_enabled: false });
    const row = seedQueue();
    const send = vi.fn();
    mocks.getProvider.mockReturnValue({ channel: 'whatsapp', send });

    await expect(runNotifications()).resolves.toEqual({ sent: 0, skipped: 1, failed: 0, deferred: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(row).toMatchObject({ status: 'skipped', last_error: 'whatsapp_disabled' });
  });

  it('defers instead of failing while the WhatsApp channel is unconfigured', async () => {
    mocks.isWhatsAppConfigured.mockReturnValue(false);
    setPrefs();
    const row = seedQueue();

    await expect(runNotifications()).resolves.toEqual({ sent: 0, skipped: 0, failed: 0, deferred: 1 });
    expect(row).toMatchObject({ status: 'pending', attempts: 0, last_error: 'whatsapp_not_configured' });
  });

  it('skips when the channel has no valid recipient', async () => {
    setPrefs({ whatsapp_phone: 'not-a-number' });
    const row = seedQueue();

    await expect(runNotifications()).resolves.toEqual({ sent: 0, skipped: 1, failed: 0, deferred: 0 });
    expect(row).toMatchObject({ status: 'skipped', last_error: 'whatsapp_no_recipient' });
  });

  it('retries with exponential backoff on a transient provider error', async () => {
    setPrefs();
    const row = seedQueue();
    mocks.getProvider.mockReturnValue({
      channel: 'whatsapp',
      send: vi.fn().mockRejectedValue(new Error('rate limited')),
    });

    await expect(runNotifications()).resolves.toEqual({ sent: 0, skipped: 0, failed: 0, deferred: 1 });
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(1);
    expect(row.last_error).toBe('rate limited');
    expect(new Date(row.scheduled_for).getTime()).toBeGreaterThan(Date.now());
  });

  it('fails permanently on 4xx provider errors (no pointless retries)', async () => {
    setPrefs();
    const row = seedQueue();
    const err = Object.assign(new Error('Template does not exist'), { status: 400 });
    mocks.getProvider.mockReturnValue({ channel: 'whatsapp', send: vi.fn().mockRejectedValue(err) });

    await expect(runNotifications()).resolves.toEqual({ sent: 0, skipped: 0, failed: 1, deferred: 0 });
    expect(row).toMatchObject({ status: 'failed', attempts: 1, last_error: 'Template does not exist' });
  });

  it('gives up once the retry budget is exhausted', async () => {
    setPrefs();
    const row = seedQueue({ attempts: 3 });
    mocks.getProvider.mockReturnValue({ channel: 'whatsapp', send: vi.fn().mockRejectedValue(new Error('boom')) });

    await expect(runNotifications()).resolves.toMatchObject({ failed: 1 });
    expect(row).toMatchObject({ status: 'failed', attempts: 4 });
  });

  it('routes the push channel to the user active device tokens', async () => {
    db.devices = [{ user_id: USER, token: 'ExponentPushToken[abc]', is_active: true }];
    setPrefs();
    const row = seedQueue({ channel: 'push' });
    const send = vi.fn().mockResolvedValue({ messageId: 'ticket-1' });
    mocks.getProvider.mockReturnValue({ channel: 'push', send });

    await expect(runNotifications()).resolves.toMatchObject({ sent: 1 });

    expect(mocks.getProvider).toHaveBeenCalledWith('push');
    expect(send).toHaveBeenCalledWith({ to: ['ExponentPushToken[abc]'], notification: expect.any(Object) });
    expect(row.provider_message_id).toBe('ticket-1');
  });
});
