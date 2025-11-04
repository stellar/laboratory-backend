import { Request, Response } from "express";
import { prisma } from "../utils/connect";

export const getAllKeysForContract = async (
  req: Request,
  res: Response,
): Promise<void | Response> => {
  try {
    const { contract_id, network = "mainnet" } = req.params;

    if (network !== "mainnet") {
      return res.status(400).json({ error: "Only mainnet is supported" });
    }

    // Use Prisma ORM to get distinct key_decoded values
    const result = await prisma.contract_data.findMany({
      where: {
        id: contract_id,
      },
      select: {
        key_decoded: true,
      },
      distinct: ["key_decoded"],
    });

    // Filter out null values and extract just the non empty key_decoded strings
    const keys = result
      .map(row => row.key_decoded)
      .filter(h => Boolean(h?.trim())) as string[];

    return res.status(200).json({
      contract_id,
      network,
      total_keys: keys.length,
      keys,
    });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
};
