import { createHash } from 'crypto';

/**
 * Stable hash of fields that constitute a "meaningful" job change.
 * Formatting-only / raw_payload noise is excluded.
 *
 * @param {Pick<import('./types.js').NormalizedJob, 'title'|'company_name'|'location'|'description'|'url'|'job_family'|'level'|'years_required'>} job
 */
export function computeContentHash(job) {
  const payload = [
    normalizeText(job.title),
    normalizeText(job.company_name),
    normalizeText(job.location),
    normalizeText(job.description),
    normalizeText(job.url),
    normalizeText(job.job_family),
    normalizeText(job.level),
    job.years_required == null ? '' : String(job.years_required),
  ].join('\u0001');

  return createHash('sha256').update(payload).digest('hex');
}

function normalizeText(value) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Merge a freshly normalized job with an existing DB row.
 * Never overwrites discovered_at. Bumps job_version only on meaningful change.
 *
 * @param {object} normalized
 * @param {object|null} existing
 * @param {{ providerUpdatedAt?: string|null }} [hints]
 */
export function applyFreshness(normalized, existing, hints = {}) {
  const now = new Date().toISOString();
  const contentHash = computeContentHash(normalized);
  const providerUpdatedAt = hints.providerUpdatedAt || normalized.updated_at || null;

  if (!existing) {
    return {
      ...normalized,
      content_hash: contentHash,
      discovered_at: now,
      last_updated_at: providerUpdatedAt || now,
      job_version: 1,
    };
  }

  const unchanged = existing.content_hash && existing.content_hash === contentHash;
  if (unchanged) {
    return {
      ...normalized,
      content_hash: contentHash,
      discovered_at: existing.discovered_at,
      last_updated_at: existing.last_updated_at,
      job_version: existing.job_version || 1,
      // Keep expires_at from existing unless newly set on normalized
      expires_at: normalized.expires_at ?? existing.expires_at ?? null,
    };
  }

  return {
    ...normalized,
    content_hash: contentHash,
    discovered_at: existing.discovered_at,
    last_updated_at: providerUpdatedAt || now,
    job_version: (existing.job_version || 1) + 1,
    expires_at: normalized.expires_at ?? null,
  };
}
