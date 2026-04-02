---
name: security-audit
description: Audit backend code for security vulnerabilities — DoS vectors, query performance, connection pool exhaustion, injection, missing rate limits, and resource exhaustion
disable-model-invocation: true
---

# Security Audit

Perform a security audit of the backend codebase, focusing on vulnerabilities that could be exploited by external attackers. Check every category below systematically.

## Audit Categories

### 1. SQL & Query Performance (DoS via slow queries)

Scan all files in `src/query-builders/` and any raw SQL in `src/controllers/` or `src/utils/`.

For each query, check:

- **CTE materialization**: Does any `ORDER BY` on a CTE wrapper force full materialization before `LIMIT` is applied? PostgreSQL must fully materialize and sort before it can limit, turning a lazy evaluation into a full scan.
- **Missing LIMIT**: Are there queries that return unbounded results? An attacker who controls data volume (e.g., pushing keys to a Stellar contract) can force massive result sets.
- **Recursive CTEs without termination guards**: Could a recursive query run indefinitely or for an attacker-controlled number of iterations?
- **Sequential scalar subqueries**: Does the query pattern cause N+1-style execution where N is attacker-controlled?
- **Missing indexes**: Are WHERE/ORDER BY clauses hitting columns without indexes? Check against the Prisma schema.

For each issue found, explain:

- What the vulnerability is
- How an attacker could exploit it (concrete steps)
- The impact (connection pool exhaustion, CPU saturation, memory, etc.)
- A suggested fix

### 2. Connection Pool Exhaustion

Check `src/utils/connect.ts` and database configuration:

- Is the Prisma connection pool explicitly configured, or relying on defaults?
- Is there a `statement_timeout` set on the database connection or individual queries?
- Are there any long-running queries that could hold connections hostage?
- Could concurrent requests to any endpoint exhaust the pool?

### 3. Rate Limiting Gaps

Check `src/index.ts` and all route files in `src/routes/`:

- Is rate limiting applied globally? What are the limits?
- Are expensive endpoints (queries that do full table scans, recursive CTEs, external API calls) protected with stricter per-route rate limits?
- Can the rate limit be bypassed (e.g., via headers, missing trust proxy config)?

### 4. Input Validation & Injection

Check all controllers in `src/controllers/` and route definitions:

- Are user inputs validated before being used in queries?
- Is `Prisma.raw()` used with user-controlled values? (This bypasses parameterization)
- Are there any string concatenation patterns in SQL construction?
- Are query parameters, path parameters, and body fields all validated?

### 5. Resource Exhaustion (non-SQL)

Check controllers and middleware:

- Are response payloads bounded? Could an endpoint return gigabytes of data?
- Are there any endpoints that make external API calls without timeouts?
- Is `server.requestTimeout` appropriate for all endpoints?
- Could an attacker trigger expensive computation (e.g., large JSON parsing, regex backtracking)?

### 6. Information Disclosure

Check error handling and responses:

- Do error responses leak stack traces, internal paths, or database details?
- Does the `/health` endpoint expose sensitive information in production?
- Are there debug modes that could be enabled by an attacker?

## Output Format

Present findings as a prioritized list:

```
## Findings

### [CRITICAL/HIGH/MEDIUM/LOW] Title
- **Location**: file:line
- **Vulnerability**: What's wrong
- **Exploit scenario**: How an attacker would use this
- **Impact**: What happens if exploited
- **Suggested fix**: How to fix it
```

If no issues are found in a category, briefly state that the category was checked and is clean.

## Known Past Vulnerabilities (for reference)

- **March 2026**: `ORDER BY` on recursive CTE wrapper in `buildKeysQuery` (`src/query-builders/keys.ts`) forced full materialization, enabling DoS via connection pool exhaustion. Fixed by removing the redundant `ORDER BY`.
