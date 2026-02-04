import { Request, Response } from "express";
import { prisma } from "../utils/connect";

export const getAllKeysForContract = async (
  req: Request,
  res: Response,
): Promise<void | Response> => {
  try {
    const { contract_id } = req.params;

    // Use raw SQL with DISTINCT to get unique key_symbol values efficiently
    const result = await prisma.$queryRaw<Array<{ key_symbol: string }>>`
      SELECT DISTINCT key_symbol
      FROM contract_data
      WHERE contract_id = ${contract_id}
        AND key_symbol IS NOT NULL
      ORDER BY key_symbol
    `;

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
