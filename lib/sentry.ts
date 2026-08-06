import { getSentryDsn } from './config';

let initialized = false;

/** Optional Sentry — no-op when DSN missing. Avoid hard dependency if package absent. */
export function initSentry(): void {
  if (initialized) return;
  const dsn = getSentryDsn();
  if (!dsn) return;
  initialized = true;
  try {
    // Dynamic require so builds work without @sentry/react-native installed.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/react-native') as {
      init: (opts: Record<string, unknown>) => void;
    };
    Sentry.init({
      dsn,
      tracesSampleRate: 0.15,
      beforeSend(event: { request?: { headers?: Record<string, string> }; user?: { id?: string } }) {
        if (event.user) {
          delete (event.user as { phone?: string }).phone;
          delete (event.user as { email?: string }).email;
        }
        return event;
      },
    });
  } catch {
    initialized = false;
  }
}

export function captureException(err: unknown): void {
  if (!getSentryDsn()) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/react-native') as {
      captureException: (e: unknown) => void;
    };
    Sentry.captureException(err);
  } catch {
    /* ignore */
  }
}
