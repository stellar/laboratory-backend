import pino, { SerializerFn } from "pino";
import { Env } from "../config/env";

const transport =
  process.env.NODE_ENV !== "production"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined;

export const logger = pino({ level: Env.logLevel, transport });

export const pinoHttpSerializers: { [key: string]: SerializerFn } = {
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
};
