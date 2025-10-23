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

import fs from "fs";
import net from "net";
import path from "path";
import { resolve } from "node:path";
import { AuthTypes, Connector, IpAddressTypes } from "@google-cloud/cloud-sql-connector";
import { PrismaClient } from "../../generated/prisma";

// Export a shared Prisma instance that will be set during initialization
export let prisma: PrismaClient;

async function cleanupSocketIfNeeded() {
  const socketPath = path.join(process.cwd(), ".s.PGSQL.5432");

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
    console.warn("Warning: Could not clean up socket file:", error.message);
  }
}

async function connect({
  instanceConnectionName,
  user,
  database,
}: {
  instanceConnectionName: string;
  user: string;
  database: string;
}) {
  const connector = new Connector();
  const socketPath = resolve(`.s.PGSQL.5432`);

  // Cleanup before starting
  await cleanupSocketIfNeeded();

  await connector.startLocalProxy({
    instanceConnectionName,
    ipType: IpAddressTypes.PUBLIC,
    authType: AuthTypes.IAM,
    listenOptions: { path: socketPath },
  });

  const datasourceUrl = `postgresql://${user}@localhost/${database}?host=${process.cwd()}`;

  prisma = new PrismaClient({ datasourceUrl });

  // Return PrismaClient and close() function
  return {
    prisma,
    async close() {
      await prisma.$disconnect();
      connector.close();
      await new Promise(resolve => setTimeout(resolve, 1000));
    },
  };
}

export { connect };
