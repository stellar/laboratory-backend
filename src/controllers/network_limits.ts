import { Request, Response } from "express";
import { Env } from "../config/env";
import { HttpError } from "../utils/error";
import { logger } from "../utils/logger";
import { StellarNetworkConfigService } from "../utils/stellarNetworkConfig";

export const getNetworkLimits = async (
  req: Request,
  res: Response,
): Promise<void | Response> => {
  const { rpc_url } = res.locals?.parsedQuery ?? req.query;

  try {
    const service = new StellarNetworkConfigService({
      networkPassphrase: Env.networkPassphrase,
      rpcUrl: rpc_url,
    });
    const limits = await service.getNetworkLimits();
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    return res.status(200).json(limits);
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({
        error: error.message,
      });
    }
    logger.warn({ err: error }, "⚠️ Failed to fetch network limits");
    return res.status(502).json({
      error: "Failed to fetch network limits",
    });
  }
};
