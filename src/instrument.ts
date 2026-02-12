import * as Sentry from "@sentry/node";
import { Env } from "./config/env";

/**
 * Sentry SDK initialization for error monitoring and performance tracing.
 *
 * This file MUST be imported before any other modules to ensure proper
 * instrumentation of the application.
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/express/
 */

Sentry.init({
  dsn: Env.sentryDsn,

  // Only enable Sentry when DSN is configured
  enabled: !!Env.sentryDsn,

  // Release version for source map association
  release: Env.gitCommit,

  // Environment tag to distinguish between dev/staging/production in Sentry UI
  environment: Env.environment,

  tracesSampleRate: 0,

  // Include request headers and IP
  sendDefaultPii: true,
});

export { Sentry };
