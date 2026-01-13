import { Request, Response } from "express";
import { prisma } from "../utils/connect";

export const getAllKeysForContract = async (
  req: Request,
  res: Response,
): Promise<void | Response> => {
  try {
    const { contract_id } = req.params;

    // Use Prisma ORM to get distinct key_symbol values
    const result = await prisma.contract_data.findMany({
      distinct: ["key_symbol"],
      select: {
        key_symbol: true,
      },
      where: {
        contract_id: contract_id,
      },
    });

    // Filter out null values and extract just the non empty key_symbol strings
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
