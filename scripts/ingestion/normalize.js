/**
 * Identity normalization only: strip HTML, trim fields.
 * Structured extraction (YOE, skills, career areas, …) lives in extraction/.
 */

export function decodeHtmlEntities(text) {
  if (!text) return '';
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function stripHtml(html) {
  if (!html) return '';

  const decoded = decodeHtmlEntities(html);

  return decoded
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * @param {object} raw
 * @returns {import('./types.js').NormalizedJob}
 */
export function normalizeJob(raw) {
  const description = stripHtml(raw.description || '');
  const title = (raw.title || '').trim();

  return {
    external_id: String(raw.external_id),
    title,
    company_name: (raw.company_name || raw.company || 'Unknown').trim(),
    location: raw.location?.trim() || null,
    description: description || null,
    url: raw.url?.trim(),
    // Legacy columns filled by extraction pipeline after runExtraction
    job_family: raw.job_family || null,
    level: raw.level || null,
    years_required: raw.years_required ?? null,
    posted_at: raw.posted_at || null,
    expires_at: raw.expires_at || null,
    raw_payload: raw.raw_payload ?? null,
  };
}

/** @deprecated Use extraction ExperienceExtractor — kept for any external callers */
export function inferYearsRequired() {
  return null;
}

/** @deprecated Use CareerAreaExtractor */
export function inferJobFamily() {
  return null;
}

/** @deprecated Use ExperienceLevelExtractor */
export function inferLevel() {
  return null;
}
