import { CursorData } from "../helpers/cursor";

export enum SortDirection {
  ASC = "asc",
  DESC = "desc",
}

export enum SortField {
  DURABILITY = "durability",
  PK_ID = "pk_id",
  TTL = "ttl",
  UPDATED_AT = "updated_at",
}

export const APIFieldToDBFieldMap: Record<SortField, string> = {
  [SortField.DURABILITY]: "durability",
  [SortField.PK_ID]: "pk_id",
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
  network: string;
  sortDirection: SortDirection;
  sortField: SortField;
  sortDbField: string;
};

/**
 * Custom error thrown when there's a mismatch between query parameters and cursor parameters.
 * This ensures pagination consistency across requests.
 */
export class CursorParameterMismatchError extends Error {
  constructor(
    public field: string,
    public queryValue: any,
    public cursorValue: any
  ) {
    super(
      `Cursor parameter mismatch for field "${field}": query value="${queryValue}" but cursor value="${cursorValue}". Pagination parameters must be consistent across requests.`
    );
    this.name = "CursorParameterMismatchError";
  }
}

export type ContractData = {
  pk_id: bigint;
  durability: string;
  key_hash: string;
  key: Buffer;
  val: Buffer;
  closed_at: Date;
  live_until_ledger_sequence: number;
  expired: boolean;
};

export type ContractDataDTO = {
  durability: string;
  key_hash: string;
  key: string;
  value: string;
  updated: number;
  ttl: number;
  expired: boolean;
};
