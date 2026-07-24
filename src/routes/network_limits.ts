import express, { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { getNetworkLimits } from "../controllers/network_limits";
import { validateParamsMiddleware } from "./contract_data";

const requestQuerySchema = z.object({
  rpc_url: z
    .url({ protocol: /^https$/ })
    .max(2048, "rpc_url must be at most 2048 characters long")
    .optional(),
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
