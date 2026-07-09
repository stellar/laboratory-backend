import { Request, Response } from "express";

export const getNetworkLimits = async (
  req: Request,
  res: Response,
): Promise<void | Response> => {
  const query = res.locals?.parsedQuery ?? req.query;
  const { rpc_url } = query;

  return res.status(200).json({
    rpc_url,
  });
};
