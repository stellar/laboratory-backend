import express from "express";

import packageJson from "../package.json";
import contractRoutes from "./routes/contract_data";
import keysRoutes from "./routes/keys";
import { connect } from "./utils/connect";

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use("/api", contractRoutes);
app.use("/api", keysRoutes);

app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "Stellar Lab API",
    version: packageJson.version,
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

app.get("/", (_req, res) => {
  res.redirect("/health");
});

let closeDbConnection: (() => Promise<void>) | null = null;
let server: ReturnType<typeof app.listen> | null = null;

/**
 * Initializes the database connection and checks if the tables exist.
 */
async function initializeDatabase() {
  console.log("Connecting to database...");
  const { prisma, close } = await connect({
    instanceConnectionName: process.env.POSTGRES_CONNECTION_NAME!,
    user: process.env.POSTGRES_IAM_USER!,
    database: process.env.DB_NAME!,
  });

  closeDbConnection = close;

  await prisma.$connect();
  console.log("✅ Database connected successfully!");

  const tables = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `;
  console.log("Available tables:", tables);
}

/**
 * Starts the server and initializes the database connection.
 */
async function startServer() {
  try {
    await initializeDatabase();

    server = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to connect to database:", error);
    process.exit(1);
  }
}

startServer();

/**
 * Gracefully shuts down the server and closes the database connection.
 */
const gracefulShutdown = async () => {
  console.log("Shutting down gracefully...");

  if (server) {
    server.close(() => {
      console.log("HTTP server closed");
    });
  }

  if (closeDbConnection) {
    await closeDbConnection();
  }

  process.exit(0);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGUSR2", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
