import express, { NextFunction, Request, Response, Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { StrKey } from "@stellar/stellar-sdk";
import { getContractDataByContractId } from "../controllers/contract_data";

const router: Router = express.Router();

/**
 * Validation schema for route parameters.
 *
 * Validates contract identifier format (base32, 56 chars) and checksum via StrKey.
 */
export const requestParamsSchema = z.object({
  contract_id: z
    .string()
    .trim()
    .regex(/^C[A-Z2-7]{55}$/, "Invalid Stellar contract ID")
    .refine(v => StrKey.isValidContract(v), "Invalid Stellar contract ID"),
});

/**
 * Validation schema for query parameters.
 *
 * Supports pagination with cursor-based navigation, configurable result limits,
 * sorting order, and multiple sort field options.
 */
const requestQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
  order: z.enum(["asc", "desc"]).default("desc"),
  cursor: z.string().trim().optional(),
  sort_by: z.enum(["durability", "key_hash", "ttl", "updated_at"]).optional(),
  // Disabled until the key_symbol indexes that keep filtered queries bounded
  // are deployed. Rejected rather than ignored, so callers never receive
  // unfiltered results that look filtered.
  filter_key: z.undefined({ error: "filter_key is not supported" }),
  // filter_key: z.string().trim().optional(),
});

/**
 * Parses Zod validation errors into a client-friendly response payload.
 *
 * @param err - The Zod validation error to parse
 * @param paramType - The type of parameter being validated (e.g., "query", "path")
 * @returns A structured error response with message and flattened issue details
 */
const parseValidationError = (err: z.ZodError, paramType: "query" | "path") => {
  return {
    message: `Invalid ${paramType} parameters`,
    issues: err.issues.map(i => ({
      path: i.path.join("."),
      message: i.message,
      code: i.code,
    })),
  };
};

/**
 * Creates Express middleware that validates request parameters against a Zod schema.
 *
 * @param schema - The Zod schema to validate parameters against
 * @param paramType - The type of parameter to validate ("path" or "query")
 * @returns Express middleware function that validates and returns 400 on validation errors
 */
export const validateParamsMiddleware = (
  schema: z.ZodTypeAny,
  paramType: "query" | "path",
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const target = paramType === "path" ? req.params : req.query;
    const parsed = schema.safeParse(target);
    if (!parsed.success) {
      return res
        .status(400)
        .json(parseValidationError(parsed.error, paramType));
    }
    if (paramType === "path") {
      res.locals.parsedParams = parsed.data;
    } else {
      res.locals.parsedQuery = parsed.data;
    }
    return next();
  };
};

// Rate-limit for the /storage route, tighter than the global limiter: storage
// queries are heavier than most, so bound how many one client can drive.
// In-memory store: the limit applies per replica.
const storageRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 100,
  message: {
    error: "Too Many Requests",
    message: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Route supports query parameters: ?cursor=xxx&limit=10&order=desc&sort_by=xxx
router.get(
  "/contract/:contract_id/storage",
  storageRateLimiter,
  validateParamsMiddleware(requestParamsSchema, "path"),
  validateParamsMiddleware(requestQuerySchema, "query"),
  getContractDataByContractId,
);

export default router;
