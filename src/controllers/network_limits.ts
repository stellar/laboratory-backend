import { Request, Response } from "express";
import { HttpError } from "../utils/error";
import { logger } from "../utils/logger";
import { StellarNetworkConfigService } from "../utils/stellarNetworkConfig";

export const getNetworkLimits = async (
  req: Request,
  res: Response,
): Promise<void | Response> => {
  const { network, rpc_url } = res.locals?.parsedQuery ?? req.query;

  try {
    const service = new StellarNetworkConfigService({
      network,
      rpcUrl: rpc_url,
    });
    const limits = await service.getNetworkLimits();
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    return res.status(200).json({
      ...limits,
      network_passphrase: service.networkPassphrase,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      // 4xx is the caller's problem and needs no operator attention; 5xx here
      // means this deployment is misconfigured, so make it visible in the logs.
      if (error.status >= 500) {
        logger.error({ err: error }, "⚠️ Network limits misconfiguration");
      }
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
