/**
 * Run an async `worker` over `items` with bounded concurrency.
 *
 * Results are returned in input order and at most `concurrency` calls are in
 * flight at once. Used by the ingestion sweep, where each source is network/LLM
 * bound and a handful in parallel shortens a full pass without changing
 * per-source behaviour.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
export async function mapPool(items, concurrency, worker) {
  const limit = Math.max(1, Math.floor(Number(concurrency) || 1));
  const results = new Array(items.length);
  let next = 0;

  // Claiming an index is synchronous, so two runners can never take the same one.
  const takeIndex = () => {
    const index = next;
    next += 1;
    return index;
  };

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    let index = takeIndex();
    while (index < items.length) {
      results[index] = await worker(items[index], index);
      index = takeIndex();
    }
  });

  await Promise.all(runners);
  return results;
}
