import { NextResponse } from 'next/server';

export function apiError(code, message, status = 400, details) {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status }
  );
}

export function validationError(details) {
  return apiError('VALIDATION_ERROR', 'Invalid input', 400, details);
}

export function unauthorized(message = 'Unauthorized') {
  return apiError('UNAUTHORIZED', message, 401);
}

export function forbidden(message = 'Forbidden') {
  return apiError('FORBIDDEN', message, 403);
}

export function notFound(message = 'Not found') {
  return apiError('NOT_FOUND', message, 404);
}

export function rateLimited() {
  return apiError('RATE_LIMITED', 'Too many requests', 429);
}

export function paymentRequired(message = 'Payment required', details) {
  return apiError('PAYMENT_REQUIRED', message, 402, details);
}

export function internalError(message = 'Internal server error') {
  return apiError('INTERNAL_ERROR', message, 500);
}
