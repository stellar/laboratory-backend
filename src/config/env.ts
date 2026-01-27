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
    return portRaw ? Number(portRaw) : 3000;
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
    return this.optionalString("GOOGLE_APPLICATION_CREDENTIALS");
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
