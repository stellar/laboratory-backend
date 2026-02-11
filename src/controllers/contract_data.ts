import { Request, Response } from "express";
import { CursorData, decodeCursor } from "../helpers/cursor";
import { buildPaginationLinks } from "../pagination/contract_data";
import {
  buildContractDataQuery,
  ContractDataQueryConfig,
} from "../query-builders/contract_data";
import { serializeContractDataResults } from "../serializers/contract_data";
import {
  APIFieldToDBFieldMap,
  ContractData,
  CursorParameterMismatchError,
  RequestParams,
  SortDirection,
  SortField,
} from "../types/contract_data";
import { prisma } from "../utils/connect";
import { getStellarService, StellarService } from "../utils/stellar";

/**
 * Parses and validates request parameters for contract data queries.
 * Extracts contract ID, pagination limit, sort field, and sort direction
 * from the request, applying defaults and validation constraints.
 *
 * @param req - Express request object containing params and query parameters
 * @returns RequestParams - Parsed and validated request parameters with type safety
 */
const parseRequestParams = (req: Request): RequestParams => {
  const { contract_id } = req.params;

  const { cursor, limit = "20" } = req.query;
  let { order = SortDirection.DESC, sort_by = SortField.KEY_HASH } = req.query;
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
        `Invalid limit=${limit}, must be an integer between 1 and 200`,
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
    SortField.KEY_HASH,
    SortField.TTL,
    SortField.UPDATED_AT,
  ];
  if (sort_by && !validSortFields.includes(sort_by as SortField)) {
    throw new Error(
      `Invalid sort_by parameter ${sort_by} must be one of ${validSortFields.join(
        ", ",
      )}`,
    );
  }
  const sortField = sort_by ? (sort_by as SortField) : SortField.KEY_HASH;

  // cursor data
  let cursorData: CursorData | undefined = undefined;
  if (cursor) {
    cursorData = decodeCursor(cursor as string);

    // Validate cursor parameters match request parameters
    if ((cursorData.sortField ?? SortField.KEY_HASH) !== sortField) {
      throw new CursorParameterMismatchError(
        "sort_by",
        sortField,
        cursorData.sortField,
      );
    }
  }

  return {
    contractId: contract_id,
    cursor: cursor as string | undefined,
    cursorData,
    limit: limitNum,
    sortDirection,
    sortField,
    sortDbField: APIFieldToDBFieldMap[sortField],
  };
};

/**
 * Fetches contract data with cursor-based pagination.
 * Latest ledger sequence is obtained from the Stellar network (RPC with Horizon fallback).
 * @param requestParams - Request parameters including contract ID, cursor, limit, and sorting
 * @returns Promise resolving to array of `ContractData` objects
 */
const getContractData = async (
  requestParams: RequestParams,
  ledgerService: StellarService = getStellarService(),
): Promise<ContractData[]> => {
  const {
    contractId,
    cursorData,
    limit,
    sortDbField,
    sortDirection,
    sortField,
  } = requestParams;

  const latestLedgerSequence = await ledgerService.getLatestLedger();

  const config: ContractDataQueryConfig = {
    contractId,
    cursorData,
    limit,
    latestLedgerSequence,
    sortDbField,
    sortDirection,
    sortField,
  };
  const results = await prisma.$queryRaw<ContractData[]>(
    buildContractDataQuery(config),
  );

  return results;
};

/**
 * Controller for retrieving contract data by contract ID with pagination.
 *
 * This endpoint fetches contract data entries for a specific contract. Results are
 * paginated using cursor-based pagination and can be sorted by various fields.
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
 * @throws {400} When request parameters are invalid
 * @throws {500} When database query fails
 */

export const getContractDataByContractId = async (
  req: Request,
  res: Response,
): Promise<void | Response> => {
  let requestParams: RequestParams;
  try {
    requestParams = parseRequestParams(req);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }

  try {
    const contractData = await getContractData(requestParams);
    const links = buildPaginationLinks(requestParams, contractData);
    return res.status(200).json({
      _links: links,
      results: serializeContractDataResults(contractData),
    });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
};
