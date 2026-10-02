import express, { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { getNetworkLimits } from "../controllers/network_limits";
import { NETWORK_NAMES } from "../utils/stellarNetworkConfig";
import { validateParamsMiddleware } from "./contract_data";

// `network` is always required and comes from the caller; the service checks
// it against the deployment's own NETWORK_PASSPHRASE (each deployment serves
// exactly one network) and rejects a mismatched pair. `rpc_url` is required
// for every network except testnet, which falls back to the SDF testnet RPC
// when it is missing or not on the testnet allowlist
const requestQuerySchema = z
  .object({
    network: z.enum(NETWORK_NAMES, {
      error: issue =>
        issue.input === undefined
          ? "network is required"
          : `network must be one of: ${NETWORK_NAMES.join(", ")}`,
    }),
    rpc_url: z
      .url({
        protocol: /^https?$/,
        error: "rpc_url must be a valid URL",
      })
      .max(2048, "rpc_url must be at most 2048 characters long")
      .optional(),
  })
  .superRefine(({ network, rpc_url }, ctx) => {
    if (rpc_url === undefined) {
      if (network !== "testnet") {
        ctx.addIssue({
          code: "custom",
          path: ["rpc_url"],
          message: "rpc_url is required",
        });
      }
      return;
    }
    if (network !== "testnet" && !rpc_url.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["rpc_url"],
        message: "rpc_url must be a valid https URL",
      });
    }
  });

const router: Router = express.Router();

const networkLimitsRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 10,
  message: {
    error: "Too Many Requests",
    message: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

router.get(
  "/network_limits",
  networkLimitsRateLimiter,
  validateParamsMiddleware(requestQuerySchema, "query"),
  getNetworkLimits,
);

export default router;
