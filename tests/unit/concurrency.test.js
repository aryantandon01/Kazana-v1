import { describe, it, expect } from 'vitest';
import { mapPool } from '@/lib/concurrency';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('mapPool', () => {
  it('keeps results in input order when work finishes out of order', async () => {
    const results = await mapPool([5, 1, 4, 2], 2, async (ms) => {
      await delay(ms);
      return ms * 10;
    });

    expect(results).toEqual([50, 10, 40, 20]);
  });

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;

    const results = await mapPool(Array.from({ length: 10 }, (_, i) => i), 3, async (i) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await delay(1);
      inFlight -= 1;
      return i * 2;
    });

    expect(peak).toBe(3);
    expect(results).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
  });

  it('runs every item once when concurrency exceeds the item count', async () => {
    const seen = [];
    const results = await mapPool(['a', 'b'], 8, async (item) => {
      seen.push(item);
      return item.toUpperCase();
    });

    expect(seen.sort()).toEqual(['a', 'b']);
    expect(results).toEqual(['A', 'B']);
  });

  it('falls back to sequential execution for a non-positive limit', async () => {
    let inFlight = 0;
    let peak = 0;

    await mapPool([1, 2, 3], 0, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await delay(1);
      inFlight -= 1;
    });

    expect(peak).toBe(1);
  });

  it('resolves an empty list without calling the worker', async () => {
    let calls = 0;
    const results = await mapPool([], 4, async () => {
      calls += 1;
    });

    expect(results).toEqual([]);
    expect(calls).toBe(0);
  });
});
