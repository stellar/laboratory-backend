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

let connectionClose: (() => Promise<void>) | null = null;

app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);

  try {
    const { prisma, close } = await connect({
      instanceConnectionName: process.env.POSTGRES_CONNECTION_NAME!,
      user: process.env.POSTGRES_IAM_USER!,
      database: process.env.DB_NAME!,
    });

    connectionClose = close;

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

    // Try to get count of contract_data records
    // const count =
    //   await prisma.$queryRaw`SELECT COUNT(*) FROM "public"."contract_data"`;

    // Try using Prisma ORM method
    try {
      const contractData = await prisma.contract_data.findMany({
        take: 5,
      });
      console.log("Contract data (ORM):", contractData);
    } catch (error) {
      console.log("ORM method failed:", error);
    }

    console.log("Connected to PostgreSQL database");
  } catch (error) {
    console.error("Failed to connect to database:", error);
  }
});

// Cleanup on exit
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");
  if (connectionClose) {
    await connectionClose();
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down gracefully...");
  if (connectionClose) {
    await connectionClose();
  }
  process.exit(0);
});
