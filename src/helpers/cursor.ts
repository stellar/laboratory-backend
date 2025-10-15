// Helper functions for cursor encoding/decoding
export const encodeCursor = (
  pkId: bigint,
  sortValue?: any,
  sortBy?: string
): string => {
  if (sortBy && sortValue !== null && sortValue !== undefined) {
    const compound = { pkId: pkId.toString(), sortValue, sortBy };
    return Buffer.from(JSON.stringify(compound)).toString("base64");
  }
  return Buffer.from(pkId.toString()).toString("base64");
};

export const decodeCursor = (
  cursor: string
): { pkId: bigint; sortValue?: any; sortBy?: string } => {
  const decoded = Buffer.from(cursor, "base64").toString();
  try {
    const parsed = JSON.parse(decoded);
    if (parsed.pkId && parsed.sortBy) {
      return {
        pkId: BigInt(parsed.pkId),
        sortValue: parsed.sortValue,
        sortBy: parsed.sortBy,
      };
    }
  } catch {
    // Fallback for old cursor format
  }
  return { pkId: BigInt(decoded) };
};
