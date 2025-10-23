import { Request, Response } from "express";
import { prisma } from "../utils/connect";
import {
  RequestParams,
  SortDirection,
  SortField,
  APIFieldToDBFieldMap,
  CursorParameterMismatchError,
} from "../types/contract_data";
import { decodeCursor } from "../helpers/cursor";
import {
  buildContractDataQuery,
  ContractDataQueryConfig,
} from "../query-builders/contract_data";
import { buildPaginationLinks } from "../pagination/contract_data";
import { serializeContractDataResults } from "../serializers/contract_data";

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

  let {
    cursor,
    limit = "20",
    order = SortDirection.DESC,
    sort_by = SortField.PK_ID,
  } = req.query;
  sort_by = (sort_by as string).toLowerCase().trim() as SortField;
  order = (order as string).toLowerCase().trim() as SortDirection;

  // limit validation
  if (limit) {
    if (
      isNaN(parseInt(limit as string)) ||
      parseInt(limit as string) < 1 ||
      parseInt(limit as string) > 200
    ) {
      throw new Error(
        `Invalid limit=${limit}, must be an integer between 1 and 200`
      );
    }
  }
  const limitNum = Math.min(parseInt(limit as string) || 10, 200); // Max 200 records

  // sort direction
  const sortDirection =
    order === SortDirection.ASC ? SortDirection.ASC : SortDirection.DESC;

  // sort field validation
  const validSortFields = [
    SortField.DURABILITY,
    SortField.PK_ID,
    SortField.TTL,
    SortField.UPDATED_AT,
  ];
  if (sort_by && !validSortFields.includes(sort_by as SortField)) {
    throw new Error(`Invalid sort_by parameter: ${sort_by}`);
  }
  const sortField = sort_by ? (sort_by as SortField) : SortField.PK_ID;

  // cursor data
  let cursorData: any = undefined;
  if (cursor) {
    cursorData = decodeCursor(cursor as string);

    // Validate cursor parameters match request parameters
    if ((cursorData.sortField ?? SortField.PK_ID) !== sortField) {
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

/**
 * Fetches contract data with cursor-based pagination and TTL caching.
 * @param requestParams - Request parameters including contract ID, cursor, limit, and sorting
 * @returns Promise resolving to array of contract data
 */
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

  const config: ContractDataQueryConfig = {
    contractId,
    cursorData,
    limit,
    sortDbField,
    sortDirection,
    sortField,
  };
  const { query, params } = buildContractDataQuery(config);

  const results = await prisma.$queryRawUnsafe(query, ...params);

  return results as any[];
};

/**
 * Controller for retrieving contract data by contract ID with pagination and TTL support.
 *
 * This endpoint fetches contract data entries for a specific contract, including their
 * time-to-live (TTL) information. Results are paginated using cursor-based pagination
 * and can be sorted by various fields.
 *
 * @example
 * GET /contracts/CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQAUHKENNYY/data
 * GET /contracts/CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQAUHKENNYY/data?limit=50&sort_by=key&order=desc
 *
 * Response format:
 * {
 *   "_links": {
 *     "self": { "href": "..." },
 *     "next": { "href": "..." },
 *     "prev": { "href": "..." }
 *   },
 *   "results": [...]
 * }
 *
 * @throws {400} When request parameters are invalid or network is not mainnet
 * @throws {500} When database query fails
 */

export const getContractDataByContractId = async (
  req: Request,
  res: Response
): Promise<void | Response> => {
  let requestParams: RequestParams;
  try {
    requestParams = parseRequestParams(req);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }

  const { network } = requestParams;
  if (network !== "mainnet") {
    return res.status(400).json({ error: "Only mainnet is supported" });
  }

  const contractData = await getContractDataWithTTL(requestParams);

  // Params for links
  const links = buildPaginationLinks(requestParams, contractData);

  return res.json({
    _links: links,
    results: serializeContractDataResults(contractData),
  });
};
