import { describe, it, expect } from 'vitest';
import { enqueueMatchNotifications } from '@/lib/notifications/enqueue';

const USER = 'user-1';

/**
 * Minimal fake for `notification_queue`. Records every upsert so we can assert
 * exactly what would have been written, and replays a recent-counts window.
 */
function fakeAdmin({ recent = [] } = {}) {
  const upserts = [];
  return {
    upserts,
    from(table) {
      if (table !== 'notification_queue') throw new Error(`unexpected table: ${table}`);
      return {
        select() {
          const chain = {
            in: () => chain,
            gte: () => Promise.resolve({ data: recent, error: null }),
          };
          return chain;
        },
        upsert(values, options) {
          upserts.push({ values, options });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
}

const optedIn = new Map([
  [
    USER,
    {
      user_id: USER,
      push_enabled: true,
      max_pushes_per_day: 5,
      whatsapp_enabled: true,
      whatsapp_phone: '+14155550123',
      whatsapp_min_match_score: 0.7,
      whatsapp_daily_limit: 3,
    },
  ],
]);

const match = (over = {}) => ({
  id: 'm1',
  user_id: USER,
  job_id: 'j1',
  score: 0.9,
  resume_id: 'r1',
  job: { title: 'Backend Engineer', company_name: 'Stripe' },
  ...over,
});

describe('match notification enqueueing', () => {
  it('enqueues one row per opted-in channel with channel metadata', async () => {
    const admin = fakeAdmin();

    const result = await enqueueMatchNotifications(admin, [match()], optedIn);

    expect(result.enqueued).toBe(2);
    expect(admin.upserts.map((u) => u.values.channel)).toEqual(['push', 'whatsapp']);
    expect(admin.upserts[0].values).toMatchObject({
      user_id: USER,
      match_id: 'm1',
      job_id: 'j1',
      type: 'job_match',
      match_score: 0.9,
      resume_id: 'r1',
      status: 'pending',
      payload: { channel: 'push', job_title: 'Backend Engineer', company_name: 'Stripe' },
    });
    expect(admin.upserts[0].values.title).toBe('New match: Stripe');
    expect(admin.upserts[0].values.body).toBe('Backend Engineer — score 90%');
  });

  it('makes the enqueue idempotent via the (user, job, channel) unique index', async () => {
    const admin = fakeAdmin();
    await enqueueMatchNotifications(admin, [match()], optedIn);

    expect(admin.upserts.every((u) => u.options.ignoreDuplicates === true)).toBe(true);
    expect(admin.upserts.every((u) => u.options.onConflict === 'user_id,job_id,channel')).toBe(true);
  });

  it('enqueues nothing for users who have opted out, with actionable reasons', async () => {
    const admin = fakeAdmin();
    const optedOut = new Map([[USER, { push_enabled: false, whatsapp_enabled: false }]]);

    const result = await enqueueMatchNotifications(admin, [match()], optedOut);

    expect(result.enqueued).toBe(0);
    expect(result.reasons).toMatchObject({ push_disabled: 1, whatsapp_disabled: 1 });
    expect(admin.upserts).toHaveLength(0);
  });

  it('enforces the per-channel daily limit against existing queue rows', async () => {
    const admin = fakeAdmin({
      recent: Array.from({ length: 5 }, () => ({ user_id: USER, channel: 'push' })),
    });

    const result = await enqueueMatchNotifications(admin, [match()], optedIn);

    expect(result.enqueued).toBe(1);
    expect(admin.upserts[0].values.channel).toBe('whatsapp');
    expect(result.reasons).toMatchObject({ daily_limit_reached: 1 });
  });

  it('applies each channel’s own match threshold', async () => {
    const admin = fakeAdmin();

    const result = await enqueueMatchNotifications(admin, [match({ score: 0.6 })], optedIn);

    // push accepts >= 0.50, WhatsApp requires >= 0.70
    expect(result.enqueued).toBe(1);
    expect(admin.upserts[0].values.channel).toBe('push');
    expect(result.reasons).toMatchObject({ below_threshold: 1 });
  });

  it('requires a stored WhatsApp number before enqueueing WhatsApp', async () => {
    const admin = fakeAdmin();
    const noPhone = new Map([
      [USER, { push_enabled: false, whatsapp_enabled: true, whatsapp_phone: null }],
    ]);

    const result = await enqueueMatchNotifications(admin, [match()], noPhone);

    expect(result.enqueued).toBe(0);
    expect(result.reasons).toMatchObject({ no_whatsapp_number: 1 });
  });
});
