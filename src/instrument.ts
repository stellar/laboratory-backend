import * as Sentry from "@sentry/node";
import { Env } from "./config/env";

/**
 * Sentry SDK initialization for error monitoring and performance tracing.
 *
 * This file MUST be imported before any other modules to ensure proper
 * instrumentation of the application.
 *
 * Environment configuration:
 * - SENTRY_DSN: Required to enable Sentry (same DSN for all environments)
 * - SENTRY_ENVIRONMENT: Optional override for environment name (defaults to NODE_ENV)
 *   Examples: "development", "staging", "production"
 * - GIT_COMMIT: Git commit SHA for release tracking (set at build/deploy time)
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
  environment: Env.sentryEnvironment,

  tracesSampleRate: 0,

  // Include request headers and IP
  sendDefaultPii: true,
});

export { Sentry };
