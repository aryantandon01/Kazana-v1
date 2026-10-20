/**
 * Email-evidence structural classification.
 *
 * SCOPE — read carefully:
 *   This module validates *structure only*. A syntactically plausible email
 *   address or subject line does NOT prove the user received it, does not
 *   prove it relates to the claimed company/role, and does NOT make the
 *   report "verified". It exists solely so that arbitrary junk input cannot
 *   claim the email-evidence confidence bonus.
 *
 * Progression the product understands:
 *
 *   none → invalid → plausible → (validated/corroborated = future work)
 *
 * Tiers:
 *   none      — nothing supplied                     → no bonus
 *   invalid   — supplied but not evidence-shaped     → no bonus
 *   plausible — evidence-shaped (email or reference) → full bonus
 *
 * Deliberately NOT implemented here (out of scope): company/domain
 * verification, inbox integration, authenticity proofs.
 */

export const EVIDENCE_STATUS = {
  NONE: 'none',
  INVALID: 'invalid',
  PLAUSIBLE: 'plausible',
};

export const EVIDENCE_KIND = {
  EMAIL: 'email',
  REFERENCE: 'reference',
};

/** Max accepted length for any single evidence value. */
const MAX_EVIDENCE_LENGTH = 2000;
/** An email local+domain can be long, but not unbounded. */
const MAX_EMAIL_LENGTH = 254;

/** Minimum shape for a free-text reference (e.g. a pasted subject line). */
const MIN_REFERENCE_LENGTH = 20;
const MIN_REFERENCE_TOKENS = 3;
const MIN_REFERENCE_LETTERS = 8;

/**
 * Conservative structural email pattern.
 * Intentionally stricter than RFC 5322 — it rejects anything ambiguous rather
 * than attempting full-spec parsing. Requires: local part (no spaces/@),
 * a single @, and a dotted domain with a non-empty TLD.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/**
 * Normalize raw evidence input: coerce to string, collapse internal
 * whitespace runs, and trim. Casing is preserved here (the hash layer
 * lowercases for dedup comparison).
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeEvidence(raw) {
  if (raw == null) return '';
  return String(raw).replace(/\s+/g, ' ').trim();
}

/**
 * Structural check for an email address.
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isPlausibleEmail(raw) {
  const value = normalizeEvidence(raw);
  if (!value || value.length > MAX_EMAIL_LENGTH) return false;
  return EMAIL_PATTERN.test(value);
}

/**
 * Structural check for a free-text reference such as a full email subject
 * line. Requires enough length, enough words, and enough actual letters that
 * short junk ("x", "hello") cannot qualify.
 * @param {string} value - already normalized
 * @returns {boolean}
 */
function isPlausibleReference(value) {
  if (value.length < MIN_REFERENCE_LENGTH || value.length > MAX_EVIDENCE_LENGTH) return false;
  const tokens = value.split(' ').filter(Boolean);
  if (tokens.length < MIN_REFERENCE_TOKENS) return false;
  const letters = (value.match(/[a-z]/gi) || []).length;
  return letters >= MIN_REFERENCE_LETTERS;
}

/**
 * Classify supplied evidence into the product's three tiers.
 * @param {unknown} raw
 * @returns {{ status: 'none'|'invalid'|'plausible', kind: 'email'|'reference'|null, value: string }}
 */
export function classifyEvidence(raw) {
  const value = normalizeEvidence(raw);
  if (!value) return { status: EVIDENCE_STATUS.NONE, kind: null, value: '' };
  if (isPlausibleEmail(value)) {
    return { status: EVIDENCE_STATUS.PLAUSIBLE, kind: EVIDENCE_KIND.EMAIL, value };
  }
  if (isPlausibleReference(value)) {
    return { status: EVIDENCE_STATUS.PLAUSIBLE, kind: EVIDENCE_KIND.REFERENCE, value };
  }
  return { status: EVIDENCE_STATUS.INVALID, kind: null, value };
}

/**
 * Does this classification earn the email-evidence confidence bonus?
 * @param {{ status: string }} classification
 * @returns {boolean}
 */
export function earnsEvidenceBonus(classification) {
  return classification?.status === EVIDENCE_STATUS.PLAUSIBLE;
}
