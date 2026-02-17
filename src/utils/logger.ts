import pino from "pino";
import type { Options } from "pino-http";
import { Env } from "../config/env";

/**
 * Pino transport configuration for logging.
 * - In production: use default transport (JSON to stdout).
 * - Otherwise: use pino-pretty for pretty output if available (dev), else default.
 * Falls back to default when pino-pretty is not installed (e.g. Docker prod deps).
 */
function getTransport() {
  if (Env.nodeEnv === "production") return undefined;
  try {
    require.resolve("pino-pretty");
    return { target: "pino-pretty", options: { colorize: true } };
  } catch {
    return undefined;
  }
}

export const logger = pino({
  level: Env.logLevel,
  transport: getTransport(),
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
