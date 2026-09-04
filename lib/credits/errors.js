/**
 * Credit system errors — normalized across RPC errors and application gates.
 */

export class CreditsError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'CreditsError';
    this.code = code;
    this.details = details;
  }
}

export const CREDITS_ERROR_CODES = {
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  OPERATION_NOT_FOUND: 'OPERATION_NOT_FOUND',
  OPERATION_DISABLED: 'OPERATION_DISABLED',
  OPERATION_NOT_RELEASABLE: 'OPERATION_NOT_RELEASABLE',
  PLAN_REQUIRED: 'PLAN_REQUIRED',
  IDEMPOTENT_REPLAY: 'IDEMPOTENT_REPLAY',
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
};

/**
 * Map a PostgREST RPC error (raised by SECURITY DEFINER functions) to a CreditsError.
 * @param {object} error - { message, details, code }
 */
export function creditsErrorFromRpc(error) {
  const message = error?.message || 'credit_error';
  let parsedDetails = null;
  try {
    parsedDetails = error?.details ? JSON.parse(error.details) : null;
  } catch {
    parsedDetails = null;
  }

  switch (message) {
    case 'insufficient_credits':
      return new CreditsError(
        CREDITS_ERROR_CODES.INSUFFICIENT_CREDITS,
        'Insufficient AI credits.',
        parsedDetails,
      );
    case 'operation_not_found':
      return new CreditsError(CREDITS_ERROR_CODES.OPERATION_NOT_FOUND, 'Credit operation not found.');
    case 'operation_not_releasable':
      return new CreditsError(
        CREDITS_ERROR_CODES.OPERATION_NOT_RELEASABLE,
        'Credit operation cannot be released.',
        parsedDetails,
      );
    case 'idempotency_key_required':
      return new CreditsError(CREDITS_ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED, 'An idempotency key is required.');
    default:
      return new CreditsError('CREDIT_ERROR', message, parsedDetails);
  }
}
