export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SENTRY_DSN) {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
  }
}

export async function onRequestError(err, request, context) {
  if (process.env.SENTRY_DSN) {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureException(err, {
      extra: { path: request?.path, method: request?.method, ...context },
    });
  }
}
