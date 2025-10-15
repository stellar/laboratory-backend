# Contract Data API

A Node.js REST API for managing contract data using Express.js and Prisma ORM with PostgreSQL.

## API Design Doc by Data Team

https://github.com/stellar/platform-design-docs/blob/contract-data-api/contract-data-api/design.md#api-design

## Prerequisites

- Node.js (v16 or higher)
- pnpm package manager
- PostgreSQL database

## Technology Stack

- Framework: Express.js 5.1.0
- Database: PostgreSQL with Prisma ORM 6.12.0
- Language: TypeScript
- Package Manager: pnpm

## Setup

### 1. **Install dependencies**

```bash
pnpm install
```

### 2. Environment Configuration

#### Step 1: Obtain Google Cloud Service Account Credentials

**Contact the DATA team to obtain `creds.json`:**

- This file contains the Google Cloud service account credentials
- Required for IAM authentication to Cloud SQL in the application
- Place the file in the project root directory as `creds.json`
- The file is already in `.gitignore` to prevent accidental commits

#### Step 2: Copy .env.example to .env file with your credentials

Configure the following environment variables:

- `DB_NAME` - Your database name
- `POSTGRES_CONNECTION_NAME` - Cloud SQL instance connection name
- `POSTGRES_IAM_USER` - IAM database user email
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to `creds.json` (e.g., `./creds.json`)
- `DATABASE_URL` - PostgreSQL connection string (see options below)

**Important Notes:**

- This API uses **IAM authentication** via Google Cloud SQL Connector for database connections in the application controllers
- The application uses `creds.json` (via `GOOGLE_APPLICATION_CREDENTIALS`) for IAM authentication
- `DATABASE_URL` is **not directly used** by the application controllers but is **required by Prisma CLI tools** for:
  - Running migrations (`pnpm migrate`)
  - Using Prisma Studio (`pnpm prisma:studio`)
  - Database introspection (`npx prisma db pull`)

**Two options for using Prisma CLI tools:**

#### Option 1: Cloud SQL Proxy with IAM Auth (Recommended)

Use the Cloud SQL Auth Proxy to connect with IAM authentication:

1. **Download the Cloud SQL Proxy** from [Google Cloud](https://cloud.google.com/sql/docs/mysql/sql-proxy)

2. **Run the proxy with IAM authentication:**

   ```bash
   ./cloud-sql-proxy --auto-iam-authn <INSTANCE_CONNECTION_NAME>
   ```

3. **Set your DATABASE_URL to use the proxy:**

   ```bash
   DATABASE_URL="postgresql://<YOUR_IAM_EMAIL>@localhost:5432/<DATABASE_NAME>?host=/cloudsql/<INSTANCE_CONNECTION_NAME>"
   ```

4. **Run Prisma commands:**
   ```bash
   npx prisma db pull
   pnpm prisma:studio
   ```

#### Option 2: Direct Connection with Username/Password

Contact the data team to get your IP address allowlisted for direct database access:

```bash
DATABASE_URL="postgresql://username:password@localhost:5432/contract_data"
```

This option is useful for Prisma Studio and running migrations locally.

### 3. Database Setup

#### Introspect your database with Prisma ORM

`npx prisma db pull`

#### Generate Prisma client

```bash
pnpm prisma:generate
# or
npx prisma generate
```

#### Run database migrations

```bash
pnpm migrate
# or
npx prisma migrate dev
```

### 4. Start the API

```bash
pnpm dev
```

## Available Scripts

- `pnpm dev` - Run development server with nodemon
- `pnpm dev:watch` - Run development server with file watching
- `pnpm build` - Build TypeScript to JavaScript
- `pnpm start` - Run production server
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm prisma:generate` - Generate Prisma client
- `pnpm migrate` - Run database migrations
- `pnpm prisma:studio` - Open Prisma Studio

#### Additional Database Commands

- Reset database: `npx prisma migrate reset`
- Deploy migrations: `npx prisma migrate deploy`
- Pull database schema: `npx prisma db pull`

#### API Endpoints

| Method | Endpoint                                | Description                     |
| ------ | --------------------------------------- | ------------------------------- |
| GET    | `/api/${network}/contracts/:id/storage` | Get contract data by ID         |
| GET    | `/api/${network}/contracts/keys`        | Get all available keys in array |

`curl http://localhost:3000/api/{network}/contract/{contract_id}/storage`

- ?sort_by=durability&order=desc - Sort by durability descending
- ?sort_by=ttl&order=asc - Sort by TTL ascending
- ?sort_by=updated_at&order=desc - Sort by updated timestamp descending

#### Project Structure

```
src/
├── controllers/ # Route handlers
├── routes/ # API routes
├── utils/ # Utility functions
└── index.ts # Main application entry

prisma/
├── schema.prisma # Database schema
└── migrations/ # Database migrations
```
