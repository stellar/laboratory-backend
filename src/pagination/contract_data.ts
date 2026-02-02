import { encodeCursor } from "../helpers/cursor";
import {
  ContractData,
  PaginationLinks,
  RequestParams,
  SortField,
} from "../types/contract_data";

/**
 * Builds pagination link href with query parameters.
 * @param baseUrl - Base URL for the link
 * @param params - Query parameters to include
 * @returns Complete href string with query parameters
 */
export const buildPaginationLinkHref = (
  baseUrl: string,
  params: Record<string, any>,
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
 * Builds pagination links (self, next, prev) for the API response.
 * @param requestParams - Request parameters including contract ID, cursor, limit, and sorting
 * @param results - Array of `ContractData` objects from the database query
 * @returns PaginationLinks object with href strings
 */
export const buildPaginationLinks = (
  requestParams: RequestParams,
  results: ContractData[],
): PaginationLinks => {
  const { contractId, cursor, limit, sortDbField, sortDirection, sortField } =
    requestParams;

  // Shared params for all links (self, next, prev)
  const queryParams = {
    order: sortDirection as string,
    limit: limit.toString(),
    ...(sortField !== SortField.KEY_HASH
      ? { sort_by: sortField as string }
      : {}),
    ...(cursor ? { cursor: cursor } : {}),
  };
  const baseUrl = `/api/contract/${contractId}/storage`;

  // links.self:
  const links: PaginationLinks = {
    self: {
      href: buildPaginationLinkHref(baseUrl, queryParams),
    },
  };

  // (optional) links.next:
  if (results.length >= limit) {
    const lastRecord = results[results.length - 1];
    const nextCursor = encodeCursor({
      cursorType: "next",
      sortField: sortField !== SortField.KEY_HASH ? sortField : undefined,
      position: {
        keyHash: lastRecord.key_hash,
        sortValue:
          sortField !== SortField.KEY_HASH
            ? (lastRecord as any)[sortDbField]
            : undefined,
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
      cursorType: "prev",
      sortField: sortField !== SortField.KEY_HASH ? sortField : undefined,
      position: {
        keyHash: firstRecord.key_hash,
        sortValue:
          sortField !== SortField.KEY_HASH
            ? (firstRecord as any)[sortDbField]
            : undefined,
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
};
