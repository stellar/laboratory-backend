import { Request, Response } from "express";
import { encodeCursor, decodeCursor, CursorData } from "../helpers/cursor";
import { prisma } from "../utils/connect";

enum SortDirection {
  ASC = "asc",
  DESC = "desc",
}

enum SortField {
  DURABILITY = "durability",
  PK_ID = "pk_id",
  TTL = "ttl",
  UPDATED_AT = "updated_at",
}

const APIFieldToDBFieldMap: Record<SortField, string> = {
  [SortField.DURABILITY]: "durability",
  [SortField.PK_ID]: "pk_id",
  [SortField.TTL]: "live_until_ledger_sequence",
  [SortField.UPDATED_AT]: "closed_at",
};

type RequestParams = {
  contractId: string;
  cursor?: string;
  cursorData: CursorData | undefined;
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

/**
 * Parses and validates request parameters for contract data queries.
 * Extracts contract ID, network, pagination limit, sort field, and sort direction
 * from the request, applying defaults and validation constraints.
 *
 * @param req - Express request object containing params and query parameters
 * @returns RequestParams - Parsed and validated request parameters with type safety
 */
const parseRequestParams = (req: Request): RequestParams => {
  const { contract_id, network = "mainnet" } = req.params;

  const {
    cursor,
    limit = "20",
    order = SortDirection.DESC,
    sort_by = SortField.PK_ID,
  } = req.query;

  // limit
  const limitNum = Math.min(parseInt(limit as string) || 10, 200); // Max 200 records

  // sort direction
  const sortDirection =
    (order as string).toLowerCase() === SortDirection.ASC
      ? SortDirection.ASC
      : SortDirection.DESC;

  // sort field
  const validSortFields = [
    SortField.DURABILITY,
    SortField.PK_ID,
    SortField.TTL,
    SortField.UPDATED_AT,
  ];
  const sortField = validSortFields.includes(
    (sort_by as string).toLowerCase() as SortField
  )
    ? (sort_by as SortField)
    : SortField.PK_ID;

  // cursor data
  let cursorData: CursorData | undefined = undefined;
  if (cursor) {
    cursorData = decodeCursor(cursor as string);

    // Validate cursor parameters match request parameters
    if (cursorData.sortField && cursorData.sortField !== sortField) {
      throw new CursorParameterMismatchError(
        "sort_by",
        sortField,
        cursorData.sortField
      );
    }
  }

  return {
    contractId: contract_id,
    cursor: cursor as string | undefined,
    cursorData,
    limit: limitNum,
    network,
    sortDirection,
    sortField,
    sortDbField: APIFieldToDBFieldMap[sortField],
  };
};

const writeIndexAndAddParam = (newParam: any, params: any[]) => {
  params.push(newParam);
  return `$${params.length}`;
};

const getContractDataWithTTL = async (
  requestParams: RequestParams
): Promise<any[]> => {
  const {
    contractId,
    cursorData,
    limit,
    sortDbField,
    sortDirection,
    sortField,
  } = requestParams;

  const params: any[] = [contractId];

  const perparePaginationClause = (
    params: any[],
    cursorData?: CursorData
  ): string => {
    if (!cursorData) {
      return "";
    }

    const operator = cursorData.sortDirection === SortDirection.ASC ? ">" : "<";

    if (cursorData.sortField && cursorData.sortField !== SortField.PK_ID) {
      return `
      AND ${sortDbField} ${operator} ${writeIndexAndAddParam(
        cursorData.position.sortValue,
        params
      )}
      OR (
        ${sortDbField} = $${params.length}
        AND pk_id ${operator} ${writeIndexAndAddParam(
        BigInt(cursorData.position.pkId),
        params
      )}
      )`;
    }

    return `AND pk_id ${operator} ${writeIndexAndAddParam(
      BigInt(cursorData.position.pkId),
      params
    )}`;
  };

  const prepareOrderByClause = (
    sortField: SortField,
    sortDirection: SortDirection
  ): string => {
    if (sortField === SortField.PK_ID) {
      return `ORDER BY pk_id ${sortDirection}`;
    } else {
      return `ORDER BY ${APIFieldToDBFieldMap[sortField]} ${sortDirection}, pk_id ${sortDirection}`;
    }
  };

  const query = `
    WITH cd_latest AS (
      SELECT DISTINCT ON (key_hash) *
      FROM contract_data
      WHERE id = $1
      ORDER BY key_hash, ledger_sequence DESC
    ),
    final_result AS (
      SELECT cd_latest.*, ttl_latest.live_until_ledger_sequence
      FROM cd_latest
      LEFT JOIN LATERAL (
        SELECT live_until_ledger_sequence
        FROM ttl
        WHERE ttl.key_hash = cd_latest.key_hash
        ORDER BY ledger_sequence DESC
        LIMIT 1
      ) ttl_latest ON true
    )
    SELECT *
    FROM final_result
    WHERE
      1=1
      ${perparePaginationClause(params, cursorData)}
    ${prepareOrderByClause(sortField, sortDirection)} -- ORDER BY (...)
    LIMIT ${writeIndexAndAddParam(limit + 1, params)};
  `;

  const results = await prisma.$queryRawUnsafe(query, ...params);

  return results as any[];
};

const buildPaginationLinkHref = (
  baseUrl: string,
  params: Record<string, any>
): string => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]: [string, any]) => {
    if (value !== undefined && value !== null) {
      searchParams.set(key, value);
    }
  });
  return `${baseUrl}?${searchParams.toString()}`;
};

/**
 * Serializes contract_data DB rows for API response.
 * Converts buffers to strings, timestamps to Unix format, and calculates expiration status.
 */
const serializeContractDataResults = (results: any[]): any[] => {
  return results.map((row: any) => ({
    durability: row.durability,
    expired: row.live_until_ledger_sequence
      ? Date.now() > row.live_until_ledger_sequence * 1000
      : false,
    key_hash: row.key_hash,
    key: row.key ? Buffer.from(row.key).toString() : null,
    ttl: row.live_until_ledger_sequence ?? null,
    updated: Math.floor(row.closed_at.getTime() / 1000),
    value: row.val ? Buffer.from(row.val).toString() : null,
  }));
};

type PaginationLinks = {
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

export const getContractDataByContractId = async (
  req: Request,
  res: Response
): Promise<void | Response> => {
  const requestParams = parseRequestParams(req);

  const { limit, network } = requestParams;
  if (network !== "mainnet") {
    return res.status(400).json({ error: "Only mainnet is supported" });
  }

  const contractData = await getContractDataWithTTL(requestParams);

  // Check if there are more records and strip the excess record
  const hasMore = contractData.length > limit;
  const results = hasMore ? contractData.slice(0, limit) : contractData;

  // Params for links
  const links: PaginationLinks = buildPaginationLinks(
    requestParams,
    hasMore,
    results
  );

  return res.json({
    _links: links,
    results: serializeContractDataResults(results),
  });
};

function buildPaginationLinks(
  requestParams: RequestParams,
  hasMore: boolean,
  results: any[]
) {
  const {
    contractId,
    cursor,
    limit,
    network,
    sortDbField,
    sortDirection,
    sortField,
  } = requestParams;

  // Shared params for all links (self, next, prev)
  const queryParams = {
    order: sortDirection as string,
    limit: limit.toString(),
    ...(sortField !== SortField.PK_ID ? { sort_by: sortField as string } : {}),
    ...(cursor ? { cursor: cursor } : {}),
  };
  const baseUrl = `/api/${network}/contract/${contractId}/storage`;

  // links.self:
  const links: PaginationLinks = {
    self: {
      href: buildPaginationLinkHref(baseUrl, queryParams),
    },
  };

  // (optional) links.next:
  if (hasMore) {
    const lastRecord = results[results.length - 1];
    const nextCursor = encodeCursor({
      sortDirection,
      sortField: sortField !== SortField.PK_ID ? sortField : undefined,
      position: {
        pkId: lastRecord.pk_id.toString(),
        sortValue:
          sortField !== SortField.PK_ID ? lastRecord[sortDbField] : undefined,
      },
    });
    links.next = {
      href: buildPaginationLinkHref(baseUrl, {
        ...queryParams,
        cursor: nextCursor,
      }),
    };
  }

  // (optional) links.prev:
  if (cursor && results.length > 0) {
    const firstRecord = results[0];
    const prevCursor = encodeCursor({
      sortDirection:
        sortDirection === SortDirection.ASC
          ? SortDirection.DESC
          : SortDirection.ASC,
      sortField: sortField !== SortField.PK_ID ? sortField : undefined,
      position: {
        pkId: firstRecord.pk_id.toString(),
        sortValue:
          sortField !== SortField.PK_ID ? firstRecord[sortDbField] : undefined,
      },
    });
    links.prev = {
      href: buildPaginationLinkHref(baseUrl, {
        ...queryParams,
        cursor: prevCursor,
      }),
    };
  }
  return links;
}
