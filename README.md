# Contract Data API

A Node.js REST API for managing contract data using Express.js with PostgreSQL.

- [Contract Data API](#contract-data-api)
  - [API Design Doc](#api-design-doc)
  - [Prerequisites](#prerequisites)
  - [Technology Stack](#technology-stack)
  - [Setup](#setup)
    - [1. Install dependencies](#1-install-dependencies)
    - [2. Environment configuration](#2-environment-configuration)
    - [3. Database setup](#3-database-setup)
    - [4. Start the API](#4-start-the-api)
  - [Makefile](#makefile)
  - [Available Scripts](#available-scripts)
  - [API Endpoints](#api-endpoints)
  - [Project Structure](#project-structure)
  - [Environment Variables](#environment-variables)
  - [Appendix: Prisma Utilities](#appendix-prisma-utilities)

## API Design Doc

[API Design Doc](https://github.com/stellar/platform-design-docs/blob/contract-data-api/contract-data-api/design.md#api-design) by Data Team.

## Prerequisites

- Node.js (v22 or higher)
- pnpm package manager
- PostgreSQL database

## Technology Stack

- Framework: Express.js 5.2.1
- Database: PostgreSQL with Prisma 6.19.0
- Language: TypeScript
- Package Manager: pnpm

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Environment configuration

#### Connection modes

There are two primary ways the API connects to PostgreSQL, plus a third variant
that combines a local proxy with the direct mode.

**Mode A: Direct database URL**
Used when `DATABASE_URL` is set. The app connects directly to whatever database
URL you provide. No proxy is required if you already have direct access to a
reachable PostgreSQL instance.

**Mode B: Cloud SQL Connector with IAM**
Used when `DATABASE_URL` is not set. Required env vars:
`DB_NAME`, `POSTGRES_CONNECTION_NAME`, `POSTGRES_IAM_USER`,
`GOOGLE_APPLICATION_CREDENTIALS`. The app uses Google Cloud credentials to
authenticate via IAM and opens a Unix socket locally to reach Cloud SQL.

**Mode C: Local Cloud SQL Proxy + direct URL**
You can run `cloud-sql-proxy` locally, then set `DATABASE_URL` to point at that
proxy. This uses the direct connection code path, but the network hop is
through the proxy you started.

##### Mode A: Direct database URL

Use this when you can connect directly to a reachable PostgreSQL instance
without any proxy.

1. Set:
   - `DATABASE_URL` - PostgreSQL connection string

Result: the app connects directly using the provided URL.

##### Mode B: Cloud SQL Connector with IAM

Use this when you want the app to authenticate to Cloud SQL using IAM
credentials and a local Unix socket.

1. Obtain Google Cloud service account credentials (`creds.json`) from the DATA team.
   - Place the file in the project root as `creds.json`.
   - It is already in `.gitignore`.
2. Set these environment variables:
   - `DB_NAME` - PostgreSQL database name
   - `POSTGRES_CONNECTION_NAME` - Cloud SQL instance connection name
   - `POSTGRES_IAM_USER` - IAM database user email
   - `GOOGLE_APPLICATION_CREDENTIALS` - Path to `creds.json` (e.g., `./creds.json`)
   - `GOOGLE_CLOUD_SQL_IP_TYPE` - (optional) IP type for the connector: `PUBLIC`, `PRIVATE`, or `PSC`. Default: `PRIVATE`.
3. Ensure `DATABASE_URL` is NOT set.

Result: the app uses IAM auth and opens a local Unix socket to Cloud SQL.

##### Mode C: Local Cloud SQL Proxy + direct URL

Use this when you want to run the proxy yourself, but still use the direct
connection code path.

1. Start the proxy:

   ```bash
   ./cloud-sql-proxy --auto-iam-authn <INSTANCE_CONNECTION_NAME>
   ```

2. Set:
   - `DATABASE_URL` - PostgreSQL connection string pointing at the proxy

Example:

```bash
DATABASE_URL="postgresql://<YOUR_IAM_EMAIL>@localhost:5432/<DATABASE_NAME>?host=/cloudsql/<INSTANCE_CONNECTION_NAME>"
```

When running via `docker compose`, use `host.docker.internal` in the host
portion of `DATABASE_URL` to reach the proxy on your machine, for example:

```bash
DATABASE_URL="postgresql://<YOUR_IAM_EMAIL>@host.docker.internal:5432/<DATABASE_NAME>?host=/cloudsql/<INSTANCE_CONNECTION_NAME>"
```

#### How connections work

The API uses a single connection entrypoint (`src/utils/connect.ts`):

- If `DATABASE_URL` is set, it uses direct mode (Mode A or Mode C).
- If `DATABASE_URL` is not set, it uses IAM mode (Mode B).

#### Using Prisma CLI tools

Prisma CLI tools require `DATABASE_URL` to be set, even when the API connects
via IAM. Use Mode C (proxy + `DATABASE_URL`) or a direct URL from Mode A.

### 3. Database setup

#### Introspect your database

```bash
pnpm prisma db pull
```

Reads the current database schema and updates `prisma/schema.prisma`.

#### Generate Prisma client

```bash
pnpm prisma:generate
```

Generates the Prisma client used by the app at runtime, based on the updated `prisma/schema.prisma`.

#### Run database migrations

```bash
pnpm migrate
```

Applies migrations and updates the database schema.

### 4. Start the API

```bash
pnpm dev
```

Starts the API in development mode using `ts-node` and `nodemon`.

## Makefile

A Makefile is included for convenience targets. Use the raw commands in this
README, and refer to `Makefile` for the current target list.

## Available Scripts

- `pnpm dev` - Run development server with nodemon
- `pnpm dev:watch` - Run development server with file watching
- `pnpm build` - Build TypeScript to JavaScript
- `pnpm start` - Run production server
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm prisma:generate` - Generate Prisma client
- `pnpm migrate` - Run database migrations
- `pnpm prisma:studio` - Open Prisma Studio
- `pnpm test` - Run tests
- `pnpm test:watch` - Run tests in watch mode
- `pnpm lint` - Run linter
- `pnpm lint:fix` - Run linter with auto-fix
- `pnpm format` - Format code
- `pnpm format:check` - Check formatting

## API Endpoints

| Method | Endpoint                    | Description                         |
| ------ | --------------------------- | ----------------------------------- |
| GET    | `/api/contract/:id/storage` | Get contract data by ID             |
| GET    | `/api/contract/:id/keys`    | Get keys associated with data by ID |
| GET    | `/health`                   | Health check                        |
| GET    | `/`                         | Redirects to `/health`              |

`curl http://localhost:3000/api/contract/{contract_id}/storage`

- ?sort_by=durability&order=desc - Sort by durability descending
- ?sort_by=ttl&order=asc - Sort by TTL ascending
- ?sort_by=updated_at&order=desc - Sort by updated timestamp descending

`curl http://localhost:3000/api/contract/{contract_id}/keys`

## Project Structure

```
src/
├── config/ # Environment configuration
├── controllers/ # Route handlers
├── routes/ # API routes
├── utils/ # Utility functions
└── index.ts # Main application entry

prisma/
├── schema.prisma # Database schema
└── migrations/ # Database migrations
```

## Environment Variables

| Variable                         | Required | Default                          | Description                                                                                    |
| -------------------------------- | -------- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `NODE_ENV`                       | No       | -                                | Node/Express ecosystem convention is to set it to `production` when deploying the application. |
| `ENVIRONMENT`                    | No       | `development`                    | Deployment environment (e.g. `dev-testnet`, `prd-testnet`)                                     |
| `DEBUG`                          | No       | -                                | Set to `true`, `1`, or `yes` to enable debug output (e.g. table listing)                       |
| `PORT`                           | No       | `3000`                           | HTTP server port (1-65535)                                                                     |
| `GIT_COMMIT`                     | No       | -                                | Git commit SHA for release tracking (set at build/deploy time)                                 |
| `TRUST_PROXY`                    | No       | `loopback,linklocal,uniquelocal` | Comma-separated trusted proxy CIDRs or named tokens                                            |
| `NETWORK_PASSPHRASE`             | No       | Testnet                          | Stellar network passphrase                                                                     |
| `HORIZON_URL`                    | No       | -                                | Stellar Horizon API URL                                                                        |
| `RPC_URL`                        | No       | -                                | Stellar Soroban RPC URL                                                                        |
| `DATABASE_URL`                   | Mode A/C | -                                | PostgreSQL connection string for direct connection                                             |
| `DB_NAME`                        | Mode B   | -                                | PostgreSQL database name                                                                       |
| `POSTGRES_CONNECTION_NAME`       | Mode B   | -                                | Cloud SQL instance connection name                                                             |
| `POSTGRES_IAM_USER`              | Mode B   | -                                | IAM database user email                                                                        |
| `GOOGLE_APPLICATION_CREDENTIALS` | Mode B   | -                                | Path to service account credentials file                                                       |
| `GOOGLE_CLOUD_SQL_IP_TYPE`       | No       | `PRIVATE`                        | Cloud SQL IP type: `PUBLIC`, `PRIVATE`, or `PSC`                                               |
| `SENTRY_DSN`                     | No       | -                                | Sentry DSN for error monitoring (leave empty to disable)                                       |

See [Environment configuration](#2-environment-configuration) for connection mode details.

## Appendix: Prisma Utilities

- Reset database: `npx prisma migrate reset`
- Deploy migrations: `npx prisma migrate deploy`
- Prisma Studio: `pnpm prisma:studio`
