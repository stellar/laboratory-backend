// Sentry must be imported first to properly instrument all modules
import { Sentry } from "./instrument";

import type { NextFunction, Request, Response } from "express";
import express from "express";

import packageJson from "../package.json";
import { Env } from "./config/env";
import contractRoutes from "./routes/contract_data";
import keysRoutes from "./routes/keys";
import { connect } from "./utils/connect";

const app = express();

const PORT = Env.port;

app.use(express.json());

app.use("/api", contractRoutes);
app.use("/api", keysRoutes);

app.get("/health", (_, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "Stellar Lab API",
    version: packageJson.version,
    commit: Env.gitCommit,
    uptime: process.uptime(),
    environment: Env.environment,
  });
});

app.get("/", (_, res) => {
  res.redirect("/health");
});

// Middlewares:
// Middleware: Sentry error handler. Must be registered after all routes but before other error handlers
Sentry.setupExpressErrorHandler(app);

// Middleware: global error handler. Avoids unhandled exceptions from leaking to clients
app.use(
  (err: unknown, req: Request, res: Response, next: NextFunction): void => {
    void req;
    if (res.headersSent) {
      next(err);
      return;
    }
    console.error("Unhandled error:", err);
    const message =
      err instanceof Error ? err.message : "Internal Server Error";
    res.status(500).json({ error: message });
  },
);

let closeDbConnection: (() => Promise<void>) | null = null;
let server: ReturnType<typeof app.listen> | null = null;

/**
 * Initializes the database connection and checks if the tables exist.
 */
async function initializeDatabase() {
  console.log("Connecting to database...");
  const { prisma, close } = await connect();

  closeDbConnection = close;

  console.log("✅ Database connected successfully!");

  if (Env.debug) {
    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    console.log("Available tables:", tables);
  }
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
    Sentry.captureException(error);
    await Sentry.flush(2000);
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
