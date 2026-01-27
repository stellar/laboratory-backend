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

// Export a shared Prisma instance that will be set during initialization
export let prisma: PrismaClient;

/**
 * Returns the directory for the Unix socket file created by Google Cloud SQL Connector.
 * Uses /tmp in production (writable by non-root users in containers).
 * Uses current directory in development for easier debugging.
 */
const getGoogleCloudSocketDir = () => {
  return process.env.NODE_ENV === "production" ? os.tmpdir() : process.cwd();
};

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
        console.log("🧹 Cleaned up existing socket file");
      }
    }
  } catch (error: any) {
    console.warn(
      "Warning: Could not clean up socket file:",
      error.message || error,
    );
  }
}

/**
 * Connects to the Google Cloud SQL database using the Google Cloud SQL Connector.
 * @param instanceConnectionName - The connection name of the Google Cloud SQL instance.
 * @param user - The username to use for the database connection.
 * @param database - The name of the database to use for the connection.
 * @returns A PrismaClient instance and a close function.
 */
async function connect({
  instanceConnectionName,
  user,
  database,
}: {
  instanceConnectionName: string;
  user: string;
  database: string;
}) {
  if (process.env.DATABASE_URL) {
    prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

    return {
      prisma,
      async close() {
        await prisma.$disconnect();
      },
    };
  }

  const gCloudSqlConnector = new Connector();
  const gCloudSqlSocketDir = getGoogleCloudSocketDir();
  const gCloudSqlSocketPath = path.join(gCloudSqlSocketDir, ".s.PGSQL.5432");

  // Cleanup before starting
  await cleanupSocketIfNeeded();

  await gCloudSqlConnector.startLocalProxy({
    instanceConnectionName,
    ipType: IpAddressTypes.PRIVATE,
    authType: AuthTypes.IAM,
    listenOptions: { path: gCloudSqlSocketPath },
  });

  const datasourceUrl = `postgresql://${user}@localhost/${database}?host=${gCloudSqlSocketDir}`;

  prisma = new PrismaClient({ datasourceUrl });

  // Return PrismaClient and close() function
  return {
    prisma,
    async close() {
      await prisma.$disconnect();
      gCloudSqlConnector.close();
      await new Promise(resolve => setTimeout(resolve, 1000));
    },
  };
}

export { connect };
