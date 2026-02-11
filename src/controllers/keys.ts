import { Request, Response } from "express";
import { prisma } from "../utils/connect";
import { buildKeysQuery } from "../query-builders/keys";

export const getAllKeysForContract = async (
  req: Request,
  res: Response,
): Promise<void | Response> => {
  try {
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
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
};
