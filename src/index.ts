import express from "express";

import { connect } from "./utils/connect";
import contractRoutes from "./routes/contract_data";

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use("/api", contractRoutes);

app.get("/", (_req, res) => {
  res.json({ message: "Stellar Lab API is running!" });
});

let server: any = null;
let closeDbConnection: (() => Promise<void>) | null = null;

server = app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);

  try {
    const { prisma, close } = await connect({
      instanceConnectionName: process.env.POSTGRES_CONNECTION_NAME!,
      user: process.env.POSTGRES_IAM_USER!,
      database: process.env.DB_NAME!,
    });

    closeDbConnection = close;

    // Test the connection
    await prisma.$connect();
    console.log("✅ Database connected successfully!");

    // First, let's check what tables exist
    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    console.log("Available tables:", tables);

    console.log("Connected to PostgreSQL database");
  } catch (error) {
    console.error("Failed to connect to database:", error);
  }
});

// Cleanup on exit
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
