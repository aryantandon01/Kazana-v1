/**
 * Phone helpers for WhatsApp recipients. WhatsApp requires E.164
 * (`+` followed by country code and national number, no spaces or punctuation).
 *
 * Two distinct jobs:
 *  - `normalizePhone` — best-effort coercion of *user input* at the API boundary.
 *  - `isValidPhone`   — strict test of a *stored* value (never invents a `+`).
 */

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Best-effort normalisation of user-entered numbers to E.164.
 * Returns `null` for empty input; returns a `+`-prefixed string otherwise
 * (which `isValidPhone` then validates).
 */
export function normalizePhone(input) {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) return `+${digits.slice(2).replace(/\D/g, '')}`;
  if (digits.startsWith('+')) return `+${digits.slice(1).replace(/\D/g, '')}`;
  return `+${digits.replace(/\D/g, '')}`;
}

/**
 * Strict E.164 check. Deliberately does NOT normalise first — a stored number
 * must already be canonical, otherwise we risk messaging a guessed number.
 */
export function isValidPhone(input) {
  if (typeof input !== 'string') return false;
  return E164.test(input.trim());
}

export { E164 };
