/**
 * AI operation catalog — the single source of credit costs.
 *
 * Credit costs live in the `ai_operations` table (configurable, no code change).
 * NEVER hardcode a credit cost in an API route or feature.
 */
import { getAdminClient } from '@/lib/supabase/admin';

/** Resume Copilot `action` → ai_operations.slug */
export const RESUME_ACTION_TO_OPERATION = {
  general_review: 'resume_optimization',
  ats_review: 'resume_optimization',
  rewrite_bullets: 'resume_rewrite',
  rewrite_summary: 'resume_rewrite',
  optimize_for_job: 'resume_tailoring',
};

export const DEFAULT_RESUME_OPERATION = 'resume_optimization';

/** Resolve the billable operation slug for a Resume Copilot action. */
export function resolveResumeOperationSlug(action) {
  return RESUME_ACTION_TO_OPERATION[action] || DEFAULT_RESUME_OPERATION;
}

let catalogCache = null;
let catalogCacheAt = 0;
const CACHE_TTL_MS = 60_000;

/** Load the full operation catalog from ai_operations (keyed by slug). */
export async function getOperationCatalog(admin = null) {
  const client = admin || getAdminClient();
  const now = Date.now();
  if (catalogCache && now - catalogCacheAt < CACHE_TTL_MS) return catalogCache;

  const { data, error } = await client.from('ai_operations').select('*');
  if (error) throw new Error(error.message);

  const bySlug = Object.fromEntries((data || []).map((op) => [op.slug, op]));
  catalogCache = bySlug;
  catalogCacheAt = now;
  return bySlug;
}

/** Force the catalog cache to refresh (used by tests / admin tooling). */
export function refreshCatalog() {
  catalogCache = null;
  catalogCacheAt = 0;
}

/** Fetch a single operation (falls back to a direct DB read on cache miss). */
export async function getOperation(slug, admin = null) {
  const catalog = await getOperationCatalog(admin);
  const op = catalog[slug];
  if (op) return op;
  // The catalog may be stale (up to TTL); fall back to a fresh read.
  const client = admin || getAdminClient();
  const { data } = await client.from('ai_operations').select('*').eq('slug', slug).maybeSingle();
  return data || null;
}

/** Resolve the configured credit cost for an operation (0 = free). */
export async function getCreditCost(slug, admin = null) {
  const op = await getOperation(slug, admin);
  return op ? Number(op.credit_cost) : 0;
}
