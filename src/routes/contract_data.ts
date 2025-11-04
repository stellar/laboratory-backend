import express, { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";

import { getContractDataByContractId } from "../controllers/contract_data";

const router: Router = express.Router();

/**
 * Validation schema for route parameters.
 *
 * Validates network selection and contract identifier.
 */
export const requestParamsSchema = z.object({
  network: z.enum(["mainnet", "testnet"]),
  contract_id: z.string().trim().min(1),
});

/**
 * Validation schema for query parameters.
 *
 * Supports pagination with cursor-based navigation, configurable result limits,
 * sorting order, and multiple sort field options.
 */
const requestQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(10),
  order: z.enum(["asc", "desc"]).default("desc"),
  cursor: z.string().trim().optional(),
  sort_by: z.enum(["durability", "pk_id", "ttl", "updated_at"]).optional(),
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
    return next();
  };
};

// Route supports query parameters: ?cursor=xxx&limit=10&order=desc&sort_by=xxx
router.get(
  "/:network/contract/:contract_id/storage",
  validateParamsMiddleware(requestParamsSchema, "path"),
  validateParamsMiddleware(requestQuerySchema, "query"),
  getContractDataByContractId,
);

export default router;
