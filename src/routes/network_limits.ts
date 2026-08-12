import express, { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { getNetworkLimits } from "../controllers/network_limits";
import { NETWORK_NAMES } from "../utils/stellarNetworkConfig";
import { validateParamsMiddleware } from "./contract_data";

// Both params are required, and both come from the caller rather than the
// deployment: `network` is the network the caller has selected, `rpc_url` the
// endpoint to read it from. The controller rejects a pair that disagrees.
// Neither has a default — falling back to one derived from NETWORK_PASSPHRASE
// meant a misconfigured instance answered with another network's limits and a
// 200, which the caller cannot distinguish from a correct response.
const requestQuerySchema = z.object({
  network: z.enum(NETWORK_NAMES, {
    error: issue =>
      issue.input === undefined
        ? "network is required"
        : `network must be one of: ${NETWORK_NAMES.join(", ")}`,
  }),
  rpc_url: z
    .url({
      protocol: /^https$/,
      error: issue =>
        issue.input === undefined
          ? "rpc_url is required"
          : "rpc_url must be a valid https URL",
    })
    .max(2048, "rpc_url must be at most 2048 characters long"),
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
