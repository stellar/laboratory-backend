import { CursorData } from "../helpers/cursor";

export enum SortDirection {
  ASC = "asc",
  DESC = "desc",
}

export enum SortField {
  DURABILITY = "durability",
  KEY_HASH = "key_hash",
  TTL = "ttl",
  UPDATED_AT = "updated_at",
}

/** DB column names that can appear in ORDER BY / cursor comparisons. */
export type SortDbField =
  | "durability"
  | "key_hash"
  | "live_until_ledger_sequence"
  | "closed_at";

export const APIFieldToDBFieldMap: Record<SortField, SortDbField> = {
  [SortField.DURABILITY]: "durability",
  [SortField.KEY_HASH]: "key_hash",
  [SortField.TTL]: "live_until_ledger_sequence",
  [SortField.UPDATED_AT]: "closed_at",
};

export type PaginationLinks = {
  self: {
    href: string;
  };
  next?: {
    href: string;
  };
  prev?: {
    href: string;
  };
};

export type RequestParams = {
  contractId: string;
  cursor?: string;
  cursorData?: CursorData;
  limit: number;
  sortDirection: SortDirection;
  sortField: SortField;
  sortDbField: SortDbField;
};

/**
 * Custom error thrown when there's a mismatch between query parameters and cursor parameters.
 * This ensures pagination consistency across requests.
 */
export class CursorParameterMismatchError extends Error {
  constructor(
    public field: string,
    public queryValue: any,
    public cursorValue: any,
  ) {
    super(
      `Cursor parameter mismatch for field "${field}": query value="${queryValue}" but cursor value="${cursorValue}". Pagination parameters must be consistent across requests.`,
    );
    this.name = "CursorParameterMismatchError";
  }
}

export type ContractData = {
  durability: string | null;
  key_hash: string;
  key: Buffer | null;
  val: Buffer | null;
  closed_at: Date;
  live_until_ledger_sequence: number | null;
  expired: boolean | null;
};

export type ContractDataDTO = {
  durability: string | null;
  key_hash: string;
  key: string | null;
  value: string | null;
  updated: number;
  ttl: number | null;
  expired: boolean;
};
