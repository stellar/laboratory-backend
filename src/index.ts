// Sentry must be imported first to properly instrument all modules
import { Sentry } from "./instrument";

import cors from "cors";
import type { NextFunction, Request, Response } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import proxyAddr from "proxy-addr";

import packageJson from "../package.json";
import { Env } from "./config/env";
import contractRoutes from "./routes/contract_data";
import keysRoutes from "./routes/keys";
import { connect } from "./utils/connect";

// ── App Setup ────────────────────────────────────────────────────────

const app = express();

// ── Middleware ────────────────────────────────────────────────────────

const trustProxyCidrs = Env.trustProxy;
app.set("trust proxy", proxyAddr.compile(trustProxyCidrs));

app.use(cors({ origin: Env.corsOrigins })); // Allow CORS for specified origins
// Sets security headers (X-Content-Type-Options, X-Frame-Options, CSP, etc.)
app.use(helmet());
// HTTP request logger
app.use(
  morgan(
    ':method :url :status :res[content-length] ":referrer" ":user-agent" - :response-time ms',
  ),
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: {
      error: "Too Many Requests",
      message: "Too many requests from this IP, please try again later.",
      retryAfter: 900,
    },
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// ── Routes ───────────────────────────────────────────────────────────

app.get("/", (_, res) => {
  res.redirect("/health");
});

app.get("/health", (_, res) => {
  const health: Record<string, unknown> = {
    status: "healthy",
    timestamp: new Date().toISOString(),
  };

  if (Env.debug) {
    health.service = "Stellar Lab API";
    health.version = packageJson.version;
    health.commit = Env.gitCommit;
    health.uptime = process.uptime();
    health.environment = Env.environment;
  }

  res.json(health);
});

app.use("/api", contractRoutes);
app.use("/api", keysRoutes);

// ── Error Handling ───────────────────────────────────────────────────

// Sentry error handler must be registered after all routes but before other error handlers
Sentry.setupExpressErrorHandler(app);

// Global error handler — prevents unhandled exceptions from leaking to clients
app.use(
  (err: unknown, _req: Request, res: Response, next: NextFunction): void => {
    if (res.headersSent) {
      next(err);
      return;
    }
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  },
);

// ── Database ─────────────────────────────────────────────────────────

let closeDbConnection: (() => Promise<void>) | null = null;

async function initializeDatabase() {
  console.log("Connecting to database...");
  const { prisma, close } = await connect();

  closeDbConnection = close;

  console.log("Database connected successfully");

  if (Env.debug) {
    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    console.log("Available tables:", tables);
  }
}

// ── Server Lifecycle ─────────────────────────────────────────────────

let server: ReturnType<typeof app.listen> | null = null;

async function startServer() {
  try {
    await initializeDatabase();

    server = app.listen(Env.port, () => {
      console.log(`Server is running on port ${Env.port}`);
    });
    server.requestTimeout = 60_000;
    server.headersTimeout = 65_000;
  } catch (error) {
    Sentry.captureException(error);
    await Sentry.flush(2000);
    console.error("Failed to connect to database:", error);
    process.exit(1);
  }
}

const SHUTDOWN_TIMEOUT_MS = 10_000;

let isShuttingDown = false;

async function gracefulShutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("Shutting down gracefully...");

  if (server) {
    const s = server;
    await Promise.race([
      new Promise<void>(resolve =>
        s.close(() => {
          console.log("HTTP server closed");
          resolve();
        }),
      ),
      new Promise<void>(resolve =>
        setTimeout(() => {
          console.warn("graceful shutdown timed out, forcing exit");
          resolve();
        }, SHUTDOWN_TIMEOUT_MS),
      ),
    ]);
  }

  if (closeDbConnection) {
    try {
      await closeDbConnection();
    } catch (error) {
      console.error("Error closing database connection:", error);
      Sentry.captureException(error);
    }
  }

  process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGUSR2", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

startServer();
