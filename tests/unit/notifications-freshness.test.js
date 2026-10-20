import { describe, it, expect } from 'vitest';
import { enqueueMatchNotifications } from '@/lib/notifications/enqueue';

const USER = 'user-1';
const NOW = new Date('2026-10-18T12:00:00.000Z');

/** Minimal `notification_queue` fake: no recent sends, records upserts. */
function fakeAdmin() {
  const upserts = [];
  return {
    upserts,
    from() {
      return {
        select() {
          const chain = {
            in: () => chain,
            gte: () => Promise.resolve({ data: [], error: null }),
          };
          return chain;
        },
        upsert(values) {
          upserts.push({ values });
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

const match = (job = {}) => ({
  id: 'm1',
  user_id: USER,
  job_id: 'j1',
  score: 0.9,
  job: { title: 'Backend Engineer', company_name: 'Stripe', ...job },
});

describe('notification job freshness gate', () => {
  it('enqueues matches for jobs posted inside the freshness window', async () => {
    const admin = fakeAdmin();
    const result = await enqueueMatchNotifications(
      admin,
      [match({ posted_at: '2026-10-15T12:00:00.000Z' })],
      optedIn,
      { now: NOW },
    );
    expect(result.enqueued).toBe(2);
    expect(admin.upserts).toHaveLength(2);
  });

  it('skips stale backlog postings so a backfill rescore cannot notify', async () => {
    const admin = fakeAdmin();
    const result = await enqueueMatchNotifications(
      admin,
      [match({ posted_at: '2026-09-01T12:00:00.000Z' })],
      optedIn,
      { now: NOW },
    );
    expect(result.enqueued).toBe(0);
    expect(result.reasons.job_stale).toBe(2);
    expect(admin.upserts).toHaveLength(0);
  });

  it('falls back to discovered_at when posted_at is null', async () => {
    const admin = fakeAdmin();
    const result = await enqueueMatchNotifications(
      admin,
      [match({ posted_at: null, discovered_at: '2026-10-17T12:00:00.000Z' })],
      optedIn,
      { now: NOW },
    );
    expect(result.enqueued).toBe(2);
  });

  it('skips jobs discovered long ago when posted_at is null', async () => {
    const admin = fakeAdmin();
    const result = await enqueueMatchNotifications(
      admin,
      [match({ posted_at: null, discovered_at: '2026-10-01T12:00:00.000Z' })],
      optedIn,
      { now: NOW },
    );
    expect(result.enqueued).toBe(0);
    expect(result.reasons.job_stale).toBe(2);
  });

  it('fails open when both dates are unknown', async () => {
    const admin = fakeAdmin();
    const result = await enqueueMatchNotifications(admin, [match()], optedIn, { now: NOW });
    expect(result.enqueued).toBe(2);
  });

  it('honours a custom maxJobAgeDays', async () => {
    const admin = fakeAdmin();
    const result = await enqueueMatchNotifications(
      admin,
      [match({ posted_at: '2026-09-20T12:00:00.000Z' })],
      optedIn,
      { now: NOW, maxJobAgeDays: 30 },
    );
    expect(result.enqueued).toBe(2);
  });
});
