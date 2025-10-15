import { Request, Response } from "express";
import { prisma } from "../utils/connect";
import { encodeCursor, decodeCursor } from "../helpers/cursor";

// Build query parameters string
const buildQueryString = (params: Record<string, any>): string => {
  const filteredParams = Object.entries(params)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return filteredParams ? `?${filteredParams}` : "";
};

export const getContractDataByContractId = async (
  req: Request,
  res: Response
): Promise<void | Response> => {
  try {
    const { contract_id, network = "mainnet" } = req.params;

    const {
      cursor,
      limit = "20",
      order = "desc",
      sort_by = "pk_id",
    } = req.query;

    const limitNum = Math.min(parseInt(limit as string) || 10, 200); // Max 200 records
    const isDesc = order === "desc";

    // Validate sort_by parameter
    const validSortFields = ["pk_id", "durability", "ttl", "updated_at"];
    const sortBy = validSortFields.includes(sort_by as string)
      ? (sort_by as string)
      : "pk_id";

    // Step 1: Get the max ledger_sequence for each key_hash
    const baseWhereClause = {
      id: contract_id,
    };

    const latestPerKeyHash = await prisma.contract_data.groupBy({
      by: ["key_hash"],
      where: baseWhereClause,
      _max: {
        ledger_sequence: true,
      },
    });

    let contractData: any[];

    // Step 2: Handle TTL sorting separately (filter TTL first, then join)
    if (sortBy === "ttl") {
      // Build TTL filter
      let ttlWhereClause: any = {
        key_hash: {
          in: latestPerKeyHash
            .map((item) => item.key_hash)
            .filter((kh): kh is string => kh !== null),
        },
      };

      // Apply cursor logic to TTL filter
      if (cursor) {
        try {
          const cursorData = decodeCursor(cursor as string);

          if (
            cursorData.sortBy === "ttl" &&
            cursorData.sortValue !== undefined
          ) {
            ttlWhereClause.OR = [
              {
                live_until_ledger_sequence: isDesc
                  ? { lt: cursorData.sortValue }
                  : { gt: cursorData.sortValue },
              },
              {
                live_until_ledger_sequence: cursorData.sortValue,
              },
            ];
          }
        } catch (error) {
          return res.status(400).json({ error: "Invalid cursor" });
        }
      }

      // Filter TTL first
      const filteredTtl = await prisma.ttl.findMany({
        where: ttlWhereClause,
        orderBy: {
          live_until_ledger_sequence: isDesc ? "desc" : "asc",
        },
        take: limitNum * 10, // Get more TTL records to account for filtering
        select: {
          key_hash: true,
          live_until_ledger_sequence: true,
        },
      });

      const filteredKeyHashes = filteredTtl.map((t) => t.key_hash);

      // Now get contract_data for those filtered key_hashes
      const finalWhereClause: any = {
        id: contract_id,
        OR: latestPerKeyHash
          .filter((item) => filteredKeyHashes.includes(item.key_hash))
          .map((item) => ({
            key_hash: item.key_hash,
            ledger_sequence: item._max.ledger_sequence!,
          })),
      };

      // Apply additional cursor filter on pk_id if same TTL value
      if (cursor) {
        try {
          const cursorData = decodeCursor(cursor as string);
          if (
            cursorData.sortBy === "ttl" &&
            cursorData.sortValue !== undefined &&
            cursorData.pkId
          ) {
            // This handles the tie-breaking case
            finalWhereClause.AND = [
              {
                OR: [
                  {
                    key_hash: {
                      in: filteredTtl
                        .filter(
                          (t) =>
                            t.live_until_ledger_sequence !==
                            cursorData.sortValue
                        )
                        .map((t) => t.key_hash),
                    },
                  },
                  {
                    key_hash: {
                      in: filteredTtl
                        .filter(
                          (t) =>
                            t.live_until_ledger_sequence ===
                            cursorData.sortValue
                        )
                        .map((t) => t.key_hash),
                    },
                    pk_id: isDesc
                      ? { lt: cursorData.pkId }
                      : { gt: cursorData.pkId },
                  },
                ],
              },
            ];
          }
        } catch (error) {
          return res.status(400).json({ error: "Invalid cursor" });
        }
      }

      contractData = await prisma.contract_data.findMany({
        where: finalWhereClause,
        orderBy: { pk_id: isDesc ? "desc" : "asc" },
        take: limitNum + 1,
      });
    } else {
      // Step 3: For non-TTL sorting, use standard approach
      let finalWhereClause: any = {
        id: contract_id,
        OR: latestPerKeyHash.map((item) => ({
          key_hash: item.key_hash,
          ledger_sequence: item._max.ledger_sequence!,
        })),
      };

      // Apply cursor logic
      if (cursor) {
        try {
          const cursorData = decodeCursor(cursor as string);

          if (
            cursorData.sortBy &&
            cursorData.sortBy === sortBy &&
            cursorData.sortValue !== undefined
          ) {
            const sortField = sortBy === "updated_at" ? "closed_at" : sortBy;

            finalWhereClause.AND = [
              {
                OR: [
                  {
                    [sortField]: isDesc
                      ? { lt: cursorData.sortValue }
                      : { gt: cursorData.sortValue },
                  },
                  {
                    [sortField]: cursorData.sortValue,
                    pk_id: isDesc
                      ? { lt: cursorData.pkId }
                      : { gt: cursorData.pkId },
                  },
                ],
              },
            ];
          } else {
            // Fallback to pk_id cursor
            finalWhereClause.AND = [
              {
                pk_id: isDesc
                  ? { lt: cursorData.pkId }
                  : { gt: cursorData.pkId },
              },
            ];
          }
        } catch (error) {
          return res.status(400).json({ error: "Invalid cursor" });
        }
      }

      // Build orderBy for non-TTL sorts
      let orderBy: any;
      if (sortBy === "updated_at") {
        orderBy = [
          { closed_at: isDesc ? "desc" : "asc" },
          { pk_id: isDesc ? "desc" : "asc" },
        ];
      } else if (sortBy === "durability") {
        orderBy = [
          { durability: isDesc ? "desc" : "asc" },
          { pk_id: isDesc ? "desc" : "asc" },
        ];
      } else {
        // Default to pk_id
        orderBy = { pk_id: isDesc ? "desc" : "asc" };
      }

      contractData = await prisma.contract_data.findMany({
        where: finalWhereClause,
        orderBy,
        take: limitNum + 1,
      });
    }

    // Check if there are more records
    const hasMore = contractData.length > limitNum;
    const results = hasMore ? contractData.slice(0, limitNum) : contractData;

    // Get max TTL per key_hash
    const keyHashes = results
      .map((item) => item.key_hash)
      .filter((kh): kh is string => kh !== null);

    const ttlRows = await prisma.ttl.findMany({
      where: { key_hash: { in: keyHashes } },
      orderBy: { ledger_sequence: "desc" },
    });

    // Create a map with the max ledger_sequence TTL per key_hash
    const maxTtlMap = new Map<string, (typeof ttlRows)[0]>();
    for (const row of ttlRows) {
      if (!maxTtlMap.has(row.key_hash!)) {
        maxTtlMap.set(row.key_hash!, row);
      }
    }

    // Convert BigInt values to strings for JSON serialization
    const serializedResults = results.map((item: any) => {
      const ttlRecord = item.key_hash
        ? maxTtlMap.get(item.key_hash) ?? null
        : null;
      const ttlValue = ttlRecord?.live_until_ledger_sequence ?? null;

      return {
        durability: item.durability,
        key: item.key ? Buffer.from(item.key).toString() : null,
        ttl: ttlValue,
        updated: Math.floor(item.closed_at.getTime() / 1000), // Convert to Unix timestamp
        value: item.val ? Buffer.from(item.val).toString() : null,
        key_hash: item.key_hash,
        expired: ttlValue ? Date.now() > ttlValue * 1000 : false,
      };
    });

    // Build links
    const baseUrl = `/api/${network}/contract/${contract_id}/storage`;
    const currentParams = {
      order,
      limit: limitNum.toString(),
      ...(sortBy !== "pk_id" ? { sort_by: sortBy } : {}),
    };

    const links: any = {
      self: {
        href: baseUrl + buildQueryString({ ...currentParams, cursor }),
      },
    };

    // Add prev link if we have results and are not at the beginning
    if (results.length > 0) {
      const firstRecord = results[0];
      let firstSortValue: any;
      if (sortBy === "ttl") {
        const ttlRecord = firstRecord.key_hash
          ? maxTtlMap.get(firstRecord.key_hash) ?? null
          : null;
        firstSortValue = ttlRecord?.live_until_ledger_sequence ?? null;
      } else if (sortBy === "updated_at") {
        firstSortValue = firstRecord.closed_at;
      } else if (sortBy === "durability") {
        firstSortValue = firstRecord.durability;
      }

      links.prev = {
        href:
          baseUrl +
          buildQueryString({
            order: isDesc ? "asc" : "desc",
            limit: limitNum.toString(),
            cursor: encodeCursor(firstRecord.pk_id, firstSortValue, sortBy),
          }),
      };
    }

    // Add next link if there are more records
    if (hasMore && results.length > 0) {
      const lastRecord = results[results.length - 1];
      let lastSortValue: any;
      if (sortBy === "ttl") {
        const ttlRecord = lastRecord.key_hash
          ? maxTtlMap.get(lastRecord.key_hash) ?? null
          : null;
        lastSortValue = ttlRecord?.live_until_ledger_sequence ?? null;
      } else if (sortBy === "updated_at") {
        lastSortValue = lastRecord.closed_at;
      } else if (sortBy === "durability") {
        lastSortValue = lastRecord.durability;
      }

      links.next = {
        href:
          baseUrl +
          buildQueryString({
            ...currentParams,
            cursor: encodeCursor(lastRecord.pk_id, lastSortValue, sortBy),
          }),
      };
    }

    res.json({
      _links: links,
      results: serializedResults,
    });
  } catch (error) {
    console.error("Error fetching contract data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
