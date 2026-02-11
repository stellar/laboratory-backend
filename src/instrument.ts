import * as Sentry from "@sentry/node";

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
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/express/
 */

const environment =
  process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development";
const isProduction = environment === "production";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Only enable Sentry when DSN is configured
  enabled: !!process.env.SENTRY_DSN,

  // Environment tag to distinguish between dev/staging/production in Sentry UI
  environment,

  // Capture 100% of transactions for tracing in development,
  // reduce to 10% in production to manage costs
  tracesSampleRate: isProduction ? 0.1 : 1.0,

  // Include request headers and IP for debugging (respects privacy settings)
  sendDefaultPii: false,

  // Enable debug mode when SENTRY_DEBUG is set (useful for troubleshooting)
  debug: !!process.env.SENTRY_DEBUG,
});

export { Sentry };
