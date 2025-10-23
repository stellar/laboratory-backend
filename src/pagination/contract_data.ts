import {
  SortField,
  SortDirection,
  PaginationLinks,
  RequestParams,
} from "../types/contract_data";
import { encodeCursor } from "../helpers/cursor";

/**
 * Builds pagination link href with query parameters.
 * @param baseUrl - Base URL for the link
 * @param params - Query parameters to include
 * @returns Complete href string with query parameters
 */
export const buildPaginationLinkHref = (
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
 * Builds pagination links (self, next, prev) for the API response.
 * @param requestParams - Request parameters including contract ID, cursor, limit, and sorting
 * @param results - Array of results from the database query
 * @returns PaginationLinks object with href strings
 */
export const buildPaginationLinks = (
  requestParams: RequestParams,
  results: any[]
): PaginationLinks => {
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
  if (results.length >= limit) {
    const lastRecord = results[results.length - 1];
    const nextCursor = encodeCursor({
      cursorType: "next",
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
      cursorType: "prev",
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
};
