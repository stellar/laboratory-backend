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

app.use(express.json()); // Parse JSON bodies
app.use(morgan("combined")); // Log requests to the console

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
  } catch (error) {
    Sentry.captureException(error);
    await Sentry.flush(2000);
    console.error("Failed to connect to database:", error);
    process.exit(1);
  }
}

async function gracefulShutdown() {
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
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGUSR2", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

startServer();
