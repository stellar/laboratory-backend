// Copyright 2024 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
  AuthTypes,
  Connector,
  IpAddressTypes,
} from "@google-cloud/cloud-sql-connector";
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import { PrismaClient } from "../../generated/prisma";
import { CloudSqlEnv, Env } from "../config/env";
import { logger } from "./logger";

// Shared Prisma instance — set during initialization via connect()
let _prisma: PrismaClient | null = null;

/**
 * Returns the shared PrismaClient instance.
 * Throws if called before connect() has completed.
 */
export function getPrisma(): PrismaClient {
  if (!_prisma) {
    throw new Error("Database not initialized — call connect() first");
  }
  return _prisma;
}

const getGoogleCloudSocketDir = () => os.tmpdir();

/**
 * Cleans up stale Unix socket file from previous runs.
 * Socket format: `.s.PGSQL.5432` (5432 = PostgreSQL port).
 */
async function cleanupSocketIfNeeded() {
  const socketPath = path.join(getGoogleCloudSocketDir(), ".s.PGSQL.5432");

  try {
    if (fs.existsSync(socketPath)) {
      // Check if socket is actually in use
      const client = new net.Socket();

      const isInUse = await new Promise<boolean>(resolve => {
        client.connect(socketPath, () => {
          client.destroy();
          resolve(true); // Socket is in use
        });

        client.on("error", () => resolve(false)); // Socket not in use

        setTimeout(() => {
          client.destroy();
          resolve(false);
        }, 100);
      });

      if (!isInUse) {
        fs.unlinkSync(socketPath);
        logger.info("🧹 Cleaned up existing socket file");
      }
    }
  } catch (error: unknown) {
    logger.warn({ err: error }, "⚠️ Could not clean up socket file");
  }
}

export type ConnectionResult = {
  prisma: PrismaClient;
  close: () => Promise<void>;
};

/**
 * Creates a Prisma connection using a direct DATABASE_URL string.
 * @param databaseUrl - Fully qualified Prisma database URL.
 * @returns A PrismaClient instance and a close function.
 */
const connectWithDatabaseUrl = async (
  databaseUrl: string,
): Promise<ConnectionResult> => {
  _prisma = new PrismaClient({ datasourceUrl: databaseUrl });

  return {
    prisma: _prisma,
    async close() {
      await _prisma!.$disconnect();
    },
  };
};

/**
 * Creates a Prisma connection using the Cloud SQL Connector with IAM auth.
 * @param instanceConnectionName - The connection name of the Cloud SQL instance.
 * @param user - IAM database user email.
 * @param database - Database name.
 * @returns A PrismaClient instance and a close function.
 */
const connectWithCloudSqlConnector = async ({
  instanceConnectionName,
  user,
  database,
  ipAddressType,
}: CloudSqlEnv): Promise<ConnectionResult> => {
  const gCloudSqlConnector = new Connector();
  const gCloudSqlSocketDir = getGoogleCloudSocketDir();
  const gCloudSqlSocketPath = path.join(gCloudSqlSocketDir, ".s.PGSQL.5432");

  // Cleanup before starting
  await cleanupSocketIfNeeded();

  await gCloudSqlConnector.startLocalProxy({
    instanceConnectionName,
    ipType: ipAddressType ?? IpAddressTypes.PRIVATE,
    authType: AuthTypes.IAM,
    listenOptions: { path: gCloudSqlSocketPath },
  });

  const datasourceUrl = `postgresql://${user}@localhost/${database}?host=${gCloudSqlSocketDir}`;

  _prisma = new PrismaClient({ datasourceUrl });

  return {
    prisma: _prisma,
    async close() {
      await _prisma!.$disconnect();
      gCloudSqlConnector.close();
      await new Promise(resolve => setTimeout(resolve, 1000));
    },
  };
};

/**
 * Connects to the Google Cloud SQL database using either a direct DATABASE_URL
 * or the Google Cloud SQL Connector with IAM authentication.
 * @returns A PrismaClient instance and a close function.
 */
async function connect(): Promise<ConnectionResult> {
  const dbConnectionMode = Env.connectionMode;
  logger.info(`🔌 Database connection mode: ${dbConnectionMode}`);

  if (dbConnectionMode === "direct_database_url") {
    const databaseUrl = Env.databaseUrl!;

    const dbConnection = await connectWithDatabaseUrl(databaseUrl);
    await dbConnection.prisma.$connect();
    return dbConnection;
  }

  const connectionParams = Env.cloudSql;

  const dbConnection = await connectWithCloudSqlConnector(connectionParams);
  await dbConnection.prisma.$connect();
  return dbConnection;
}

export { connect };
