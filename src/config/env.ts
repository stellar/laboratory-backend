import { IpAddressTypes } from "@google-cloud/cloud-sql-connector";
import { Networks } from "@stellar/stellar-sdk";

type CloudSqlEnv = {
  instanceConnectionName: string;
  user: string;
  database: string;
  ipAddressType?: IpAddressTypes;
};

type ConnectionMode = "direct_database_url" | "cloud_sql_connector_iam";

class Env {
  static get environment() {
    return this.optionalString("ENVIRONMENT") ?? "development";
  }

  static get debug() {
    const v = this.optionalString("DEBUG")?.toLowerCase().trim();
    return ["true", "1", "yes"].includes(v ?? "");
  }

  static get port() {
    const portRaw = this.optionalString("PORT");

    if (!portRaw) {
      return 3000;
    }

    const port = parseInt(portRaw, 10);

    if (
      Number.isNaN(port) ||
      !Number.isInteger(port) ||
      port <= 0 ||
      port > 65535
    ) {
      throw new Error(
        `Invalid PORT environment variable: "${portRaw}". Expected an integer between 1 and 65535.`,
      );
    }

    return port;
  }

  static get databaseUrl() {
    return this.optionalString("DATABASE_URL");
  }

  static get networkPassphrase() {
    return this.optionalString("NETWORK_PASSPHRASE") ?? Networks.TESTNET;
  }

  static get horizonUrl() {
    return this.optionalString("HORIZON_URL");
  }

  static get rpcUrl() {
    return this.optionalString("RPC_URL");
  }

  static get sentryDsn() {
    return this.optionalString("SENTRY_DSN");
  }

  static get gitCommit() {
    return this.optionalString("GIT_COMMIT");
  }

  static get corsOrigins(): (string | RegExp)[] {
    const raw = this.optionalString("CORS_ORIGINS");
    const defaultValue =
      "https://lab.stellar.org,/^https:\\/\\/.*\\.services\\.stellar-ops\\.com$/";
    return (raw ?? defaultValue)
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
      .map(entry => {
        const match = entry.match(/^\/(.+)\/([gimsuy]*)$/);
        return match ? new RegExp(match[1], match[2]) : entry;
      });
  }

  static get trustProxy(): string[] {
    const raw = this.optionalString("TRUST_PROXY");
    const defaultValue = "loopback,linklocal,uniquelocal";
    return (raw ?? defaultValue)
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
  }

  static get connectionMode(): ConnectionMode {
    return this.databaseUrl ? "direct_database_url" : "cloud_sql_connector_iam";
  }

  static get cloudSql(): CloudSqlEnv {
    return {
      instanceConnectionName: this.requiredString("POSTGRES_CONNECTION_NAME"),
      user: this.requiredString("POSTGRES_IAM_USER"),
      database: this.requiredString("DB_NAME"),
      ipAddressType: this.googleCloudSqlIpType,
    };
  }

  static get googleCloudSqlIpType(): IpAddressTypes {
    const raw = this.optionalString("GOOGLE_CLOUD_SQL_IP_TYPE");
    if (!raw) {
      return IpAddressTypes.PRIVATE;
    }
    const upper = raw.trim().toUpperCase();
    const validIpTypes = Object.values(IpAddressTypes);
    if (!validIpTypes.includes(upper as IpAddressTypes)) {
      throw new Error(
        `Invalid GOOGLE_CLOUD_SQL_IP_TYPE: "${raw}". Expected one of: ${validIpTypes.join(", ")}.`,
      );
    }
    return upper as IpAddressTypes;
  }

  static get googleApplicationCredentials() {
    const value = this.optionalString("GOOGLE_APPLICATION_CREDENTIALS");

    if (this.connectionMode === "cloud_sql_connector_iam" && !value) {
      throw new Error(
        "Missing required environment variable: GOOGLE_APPLICATION_CREDENTIALS (required when using cloud_sql_connector_iam connection mode)",
      );
    }

    return value;
  }

  private static optionalString(name: string) {
    const value = process.env[name];

    if (!value) {
      return undefined;
    }

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : undefined;
  }

  private static requiredString(name: string) {
    const value = this.optionalString(name);

    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
  }
}

export { Env, type CloudSqlEnv, type ConnectionMode, type IpAddressTypes };
