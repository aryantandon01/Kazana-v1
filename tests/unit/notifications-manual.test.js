import { describe, it, expect } from 'vitest';
import {
  buildWaLink,
  composeWaText,
  listManualWhatsAppQueue,
  markManualSent,
  MANUAL_STALE_DAYS,
} from '@/lib/notifications/manual';
import { buildNotification } from '@/lib/notifications/message';
import { parseManualArgs } from '@/scripts/notifications/manualArgs';

const NOW = new Date('2026-10-18T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY_MS).toISOString();

/** In-memory stand-in for the Supabase admin client (select/update + eq/in/lte). */
function fakeAdmin({ queue = [], prefs = [], matches = [] } = {}) {
  const state = {
    queue: queue.map((row) => ({ ...row })),
    prefs: prefs.map((row) => ({ ...row })),
    matches: matches.map((row) => ({ ...row })),
  };

  const rowsFor = (table) => {
    if (table === 'notification_queue') return state.queue;
    if (table === 'notification_preferences') return state.prefs;
    if (table === 'matches') return state.matches;
    throw new Error(`unexpected table: ${table}`);
  };

  return {
    state,
    from(table) {
      const q = { op: 'select', filters: [], patch: null, order: null, limit: null };

      const passes = (row) =>
        q.filters.every(([op, col, val]) => {
          if (op === 'eq') return row[col] === val;
          if (op === 'in') return val.includes(row[col]);
          if (op === 'lte') return String(row[col]) <= String(val);
          return true;
        });

      const execute = () => {
        let rows = rowsFor(table).filter(passes);
        if (q.op === 'update') {
          for (const row of rows) Object.assign(row, q.patch);
        }
        if (q.order) {
          const [col, ascending] = q.order;
          rows = [...rows].sort((a, b) =>
            ascending ? String(a[col]).localeCompare(String(b[col])) : String(b[col]).localeCompare(String(a[col])),
          );
        }
        if (q.limit != null) rows = rows.slice(0, q.limit);
        return { data: rows, error: null };
      };

      const api = {
        select: () => api,
        update: (patch) => {
          q.op = 'update';
          q.patch = patch;
          return api;
        },
        eq: (col, val) => {
          q.filters.push(['eq', col, val]);
          return api;
        },
        in: (col, val) => {
          q.filters.push(['in', col, val]);
          return api;
        },
        lte: (col, val) => {
          q.filters.push(['lte', col, val]);
          return api;
        },
        order: (col, { ascending = true } = {}) => {
          q.order = [col, ascending];
          return api;
        },
        limit: (n) => {
          q.limit = n;
          return api;
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

const queueRow = (over = {}) => ({
  id: 'q1',
  user_id: 'u1',
  match_id: 'm1',
  job_id: 'j1',
  channel: 'whatsapp',
  status: 'pending',
  scheduled_for: daysAgo(1),
  created_at: daysAgo(1),
  title: 'New match: Stripe',
  body: 'Backend Engineer — score 91%',
  payload: { type: 'job_match', job_title: 'Backend Engineer', company_name: 'Stripe', score: 0.912 },
  ...over,
});

const prefsRow = (over = {}) => ({
  user_id: 'u1',
  whatsapp_enabled: true,
  whatsapp_phone: '+14155550123',
  ...over,
});

describe('manual WhatsApp links', () => {
  it('builds a wa.me link without the E.164 plus and encodes the text', () => {
    expect(buildWaLink('+14155550123', 'hi there')).toBe(
      'https://wa.me/14155550123?text=hi%20there',
    );
    expect(buildWaLink(null, 'x')).toBeNull();
    expect(buildWaLink('', 'x')).toBeNull();
  });

  it('composes the same three variables as the Cloud API template', () => {
    expect(
      composeWaText({ jobTitle: 'Backend Engineer', companyName: 'Stripe', scorePercent: 91 }),
    ).toBe('Kazana · New match: Backend Engineer at Stripe (91% match)');
    expect(composeWaText({})).toBe('Kazana · New match: A new role');
    expect(composeWaText({ jobTitle: 'Backend Engineer', scorePercent: '' })).toBe(
      'Kazana · New match: Backend Engineer',
    );
  });

  it('derives the copy from the stored row via buildNotification', () => {
    expect(buildNotification(queueRow()).scorePercent).toBe(91);
  });
});

describe('listManualWhatsAppQueue', () => {
  it('returns only opted-in rows with a valid E.164 number', async () => {
    const admin = fakeAdmin({
      queue: [
        queueRow(),
        queueRow({ id: 'q2', user_id: 'u2' }),
        queueRow({ id: 'q3', user_id: 'u3' }),
        queueRow({
          id: 'q4',
          user_id: 'u4',
          created_at: daysAgo(MANUAL_STALE_DAYS + 3),
        }),
      ],
      prefs: [
        prefsRow(),
        prefsRow({ user_id: 'u2', whatsapp_enabled: false }),
        prefsRow({ user_id: 'u3', whatsapp_phone: '4155550123' }),
        prefsRow({ user_id: 'u4' }),
      ],
    });

    const result = await listManualWhatsAppQueue(admin, { now: NOW });

    expect(result.scanned).toBe(4);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'q1',
      phone: '+14155550123',
      text: 'Kazana · New match: Backend Engineer at Stripe (91% match)',
      link: 'https://wa.me/14155550123?text=Kazana%20%C2%B7%20New%20match%3A%20Backend%20Engineer%20at%20Stripe%20(91%25%20match)',
    });
    expect(result.skipped).toEqual({ disabled: 1, no_phone: 1, stale: 1 });
  });

  it('includes stale rows only when asked', async () => {
    const admin = fakeAdmin({
      queue: [queueRow({ created_at: daysAgo(MANUAL_STALE_DAYS + 3) })],
      prefs: [prefsRow()],
    });

    const fresh = await listManualWhatsAppQueue(admin, { now: NOW });
    expect(fresh.items).toHaveLength(0);
    expect(fresh.skipped.stale).toBe(1);

    const all = await listManualWhatsAppQueue(admin, { now: NOW, includeStale: true });
    expect(all.items).toHaveLength(1);
    expect(all.skipped.stale).toBe(0);
  });

  it('skips users with no preferences row', async () => {
    const admin = fakeAdmin({ queue: [queueRow()], prefs: [] });

    const result = await listManualWhatsAppQueue(admin, { now: NOW });

    expect(result.items).toHaveLength(0);
    expect(result.skipped.disabled).toBe(1);
  });

  it('lists rows regardless of the worker retry schedule', async () => {
    const admin = fakeAdmin({
      queue: [queueRow({ scheduled_for: daysAgo(-2) })],
      prefs: [prefsRow()],
    });

    const result = await listManualWhatsAppQueue(admin, { now: NOW });

    expect(result.items).toHaveLength(1);
  });
});

describe('markManualSent', () => {
  it('marks only pending rows and updates matches.notified_at', async () => {
    const admin = fakeAdmin({
      queue: [
        queueRow({ id: 'q1', match_id: 'm1' }),
        queueRow({ id: 'q2', status: 'sent', match_id: 'm2' }),
        queueRow({ id: 'q3', match_id: null }),
      ],
      matches: [
        { id: 'm1', notified_at: null },
        { id: 'm2', notified_at: null },
      ],
    });

    const result = await markManualSent(admin, ['q1', 'q2', 'q3'], { now: NOW });

    expect(result).toEqual({ marked: 2, ids: ['q1', 'q3'] });

    const [q1, q2, q3] = admin.state.queue;
    expect(q1.status).toBe('sent');
    expect(q1.sent_at).toBe(NOW.toISOString());
    expect(q1.provider_message_id).toBe(`manual:${NOW.toISOString()}`);
    expect(q2.status).toBe('sent');
    expect(q2.sent_at).toBeUndefined();
    expect(q3.status).toBe('sent');
    expect(admin.state.matches[0].notified_at).toBe(NOW.toISOString());
    expect(admin.state.matches[1].notified_at).toBeNull();
  });

  it('is a no-op without ids', async () => {
    const admin = fakeAdmin({ queue: [queueRow()] });

    await expect(markManualSent(admin, [])).resolves.toEqual({ marked: 0, ids: [] });
    expect(admin.state.queue[0].status).toBe('pending');
  });
});

describe('parseManualArgs', () => {
  it('defaults to a bounded listing', () => {
    expect(parseManualArgs([])).toEqual({
      limit: 50,
      includeStale: false,
      confirmSent: false,
      ids: [],
      help: false,
    });
  });

  it('parses listing and confirmation flags', () => {
    const opts = parseManualArgs([
      '--limit',
      '10',
      '--include-stale',
      '--confirm-sent',
      '--id',
      'a',
      '--id',
      'b',
    ]);

    expect(opts).toMatchObject({
      limit: 10,
      includeStale: true,
      confirmSent: true,
      ids: ['a', 'b'],
    });
  });

  it('ignores non-numeric limits and supports --help', () => {
    expect(parseManualArgs(['--limit', 'nope']).limit).toBe(50);
    expect(parseManualArgs(['--help']).help).toBe(true);
    expect(parseManualArgs(['-h']).help).toBe(true);
  });
});

