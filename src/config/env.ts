type CloudSqlEnv = {
  instanceConnectionName: string;
  user: string;
  database: string;
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

  static get connectionMode(): ConnectionMode {
    return this.databaseUrl ? "direct_database_url" : "cloud_sql_connector_iam";
  }

  static get cloudSql(): CloudSqlEnv {
    return {
      instanceConnectionName: this.requiredString("POSTGRES_CONNECTION_NAME"),
      user: this.requiredString("POSTGRES_IAM_USER"),
      database: this.requiredString("DB_NAME"),
    };
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

export { Env, type CloudSqlEnv, type ConnectionMode };
