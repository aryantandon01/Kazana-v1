/**
 * Parse ?page=&limit= with sensible defaults for production APIs.
 */
export function parsePagination(searchParams, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(
    maxLimit,
    Math.max(1, parseInt(searchParams.get('limit') || String(defaultLimit), 10))
  );
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return { page, limit, from, to };
}
