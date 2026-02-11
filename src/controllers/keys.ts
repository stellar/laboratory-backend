import { Request, Response } from "express";
import { buildKeysQuery } from "../query-builders/keys";
import { prisma } from "../utils/connect";

export const getAllKeysForContract = async (
  req: Request,
  res: Response,
): Promise<void | Response> => {
  const { contract_id } = req.params;

  const result = await prisma.$queryRaw<Array<{ key_symbol: string }>>(
    buildKeysQuery(contract_id),
  );

  const keys = result
    .map(row => row.key_symbol)
    .filter(h => Boolean(h?.trim())) as string[];

  return res.status(200).json({
    contract_id,
    total_keys: keys.length,
    keys,
  });
};
