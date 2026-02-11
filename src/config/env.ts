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
  static get nodeEnv() {
    return this.optionalString("NODE_ENV") ?? "development";
  }

  static get isProduction() {
    return this.nodeEnv === "production";
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
