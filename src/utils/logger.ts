import pino, { SerializerFn } from "pino";
import type { Options } from "pino-http";
import { Env } from "../config/env";

const transport =
  process.env.NODE_ENV !== "production"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined;

export const logger = pino({ level: Env.logLevel, transport });

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
