import pino from "pino";
import type { Options } from "pino-http";
import { Env } from "../config/env";

/**
 * Pino transport configuration for logging.
 * - When not in production, use pino-pretty for pretty printing with colors.
 * - When in production, leave undefined to use the default transport (console).
 */
const transport =
  Env.nodeEnv !== "production"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined;

export const logger = pino({
  level: Env.logLevel,
  transport,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

export const pinoHttpOptions: Options = {
  logger,
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
};
