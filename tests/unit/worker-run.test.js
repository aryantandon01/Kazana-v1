import { describe, it, expect, vi } from 'vitest';
import { summarizeIngest, runIngestCycle, runPulse } from '@/lib/worker/run';

const silent = () => {};

describe('summarizeIngest', () => {
  it('aggregates per-source results and caps the failed-source list', () => {
    const results = [
      { source: 'a', status: 'success', jobsFetched: 10, jobsUpserted: 4, llmCalls: 2, llmUsage: { estimated_cost_usd: 0.01 } },
      { source: 'b', status: 'success', jobsFetched: 5, jobsUpserted: 1, llmCalls: 0, llmUsage: { estimated_cost_usd: 0 } },
      { source: 'c', status: 'failed', jobsFetched: 0, jobsUpserted: 0, error: 'boom' },
    ];

    const summary = summarizeIngest(results);

    expect(summary).toMatchObject({
      sources: 3,
      succeeded: 2,
      failed: 1,
      jobs_fetched: 15,
      jobs_upserted: 5,
      llm_calls: 2,
      estimated_cost_usd: 0.01,
      failed_sources: ['c'],
    });
  });

  it('handles an empty sweep', () => {
    expect(summarizeIngest([])).toMatchObject({ sources: 0, succeeded: 0, failed: 0, estimated_cost_usd: 0 });
  });
});

describe('runIngestCycle', () => {
  it('reports a successful sweep', async () => {
    const log = vi.fn();
    const report = await runIngestCycle({
      ingest: async () => [{ source: 'a', status: 'success', jobsUpserted: 2 }],
      log,
    });

    expect(report).toMatchObject({ ok: true, sources: 1, failed: 0, jobs_upserted: 2 });
    expect(report.duration_ms).toBeGreaterThanOrEqual(0);
    expect(log).toHaveBeenCalledWith('[worker] ingest', expect.stringContaining('"jobs_upserted":2'));
  });

  it('treats a partially failed sweep as not ok', async () => {
    const report = await runIngestCycle({
      ingest: async () => [
        { source: 'a', status: 'success' },
        { source: 'b', status: 'failed' },
      ],
      log: silent,
    });

    expect(report.ok).toBe(false);
    expect(report.failed).toBe(1);
  });

  it('swallows a thrown sweep instead of killing the loop', async () => {
    const log = vi.fn();
    const report = await runIngestCycle({
      ingest: async () => {
        throw new Error('supabase down');
      },
      log,
    });

    expect(report).toMatchObject({ ok: false, error: 'supabase down' });
    expect(log).toHaveBeenCalledWith('[worker] ingest_failed', '{"error":"supabase down"}');
  });
});

describe('runPulse', () => {
  it('matches before notifying so the queue is populated by the same pulse', async () => {
    const calls = [];
    const result = await runPulse({
      match: async () => {
        calls.push('match');
        return { matched: 3, enqueued: 2 };
      },
      notify: async () => {
        calls.push('notify');
        return { sent: 2, skipped: 0, failed: 0, deferred: 0 };
      },
      log: silent,
    });

    expect(calls).toEqual(['match', 'notify']);
    expect(result).toMatchObject({ ok: true, errors: [] });
    expect(result.notifications.sent).toBe(2);
  });

  it('still drains the queue when matching throws', async () => {
    const notify = vi.fn().mockResolvedValue({ sent: 1 });
    const result = await runPulse({
      match: async () => {
        throw new Error('scoring failed');
      },
      notify,
      log: silent,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(['match: scoring failed']);
    expect(notify).toHaveBeenCalledOnce();
    expect(result.notifications).toEqual({ sent: 1 });
  });

  it('reports a notify failure without masking a successful match', async () => {
    const result = await runPulse({
      match: async () => ({ matched: 1 }),
      notify: async () => {
        throw new Error('whatsapp 401');
      },
      log: silent,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(['notify: whatsapp 401']);
    expect(result.matching).toEqual({ matched: 1 });
  });
});
