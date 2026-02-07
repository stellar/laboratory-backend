/** Values accepted as SQL parameters (Prisma $queryRaw) */
export type SqlParam =
  | string
  | number
  | Date
  | Buffer
  | null
  | boolean
  | bigint
  | undefined;

/** Result of building a SQL query */
export type QueryResult = { query: string; params: SqlParam[] };
