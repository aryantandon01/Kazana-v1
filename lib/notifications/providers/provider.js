/**
 * Provider contract for notification channels.
 *
 * Every provider exposes `send({ to, notification })` which resolves to
 * `{ messageId }` on success and throws an `Error` on failure. Errors may carry
 * a numeric `status` (HTTP status) so the worker can classify transient vs
 * permanent failures.
 *
 * @typedef {object} NotificationProvider
 * @property {string} channel
 * @property {(args: { to: any, notification: object }) => Promise<{ messageId: string|null }>} send
 */

export function assertProvider(provider) {
  if (!provider || typeof provider.send !== 'function') {
    throw new Error('Invalid notification provider: missing send()');
  }
  return provider;
}

/** @returns {string} a short, log-safe description (never includes PII). */
export function describeRecipient(to) {
  if (Array.isArray(to)) return `tokens:${to.length}`;
  if (typeof to === 'string') return `e164:${to.slice(0, 3)}***${to.slice(-2)}`;
  return 'unknown';
}
