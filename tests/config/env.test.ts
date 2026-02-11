import { Networks } from "@stellar/stellar-sdk";
import { Env } from "../../src/config/env";

describe("Env", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("port", () => {
    test("🟢returns_default_3000_when_not_set", () => {
      delete process.env.PORT;
      expect(Env.port).toBe(3000);
    });

    test("🟢parses_valid_port", () => {
      process.env.PORT = "8080";
      expect(Env.port).toBe(8080);
    });

    test("🔴throws_on_invalid_port_non_numeric", () => {
      process.env.PORT = "abc";
      expect(() => Env.port).toThrow(
        'Invalid PORT environment variable: "abc". Expected an integer between 1 and 65535.',
      );
    });

    test("🔴throws_on_invalid_port_out_of_range", () => {
      process.env.PORT = "70000";
      expect(() => Env.port).toThrow();
    });
  });

  describe("connectionMode", () => {
    test("🟢returns_direct_database_url_when_DATABASE_URL_set", () => {
      process.env.DATABASE_URL = "postgresql://localhost";
      expect(Env.connectionMode).toBe("direct_database_url");
    });

    test("🟢returns_cloud_sql_connector_iam_when_DATABASE_URL_not_set", () => {
      delete process.env.DATABASE_URL;
      expect(Env.connectionMode).toBe("cloud_sql_connector_iam");
    });
  });

  describe("optionalString", () => {
    test("🟢returns_undefined_when_not_set", () => {
      delete process.env.DATABASE_URL;
      expect(Env.databaseUrl).toBeUndefined();
    });

    test("🟢trims_whitespace", () => {
      process.env.DATABASE_URL = "  postgresql://localhost  ";
      expect(Env.databaseUrl).toBe("postgresql://localhost");
    });

    test("🟡returns_undefined_for_empty_string", () => {
      process.env.DATABASE_URL = "";
      expect(Env.databaseUrl).toBeUndefined();
    });
  });

  describe("networkPassphrase", () => {
    test("🟢defaults_to_testnet_when_missing", () => {
      delete process.env.NETWORK_PASSPHRASE;
      expect(Env.networkPassphrase).toBe(Networks.TESTNET);
    });

    test("🟢returns_value_when_set", () => {
      process.env.NETWORK_PASSPHRASE = Networks.PUBLIC;
      expect(Env.networkPassphrase).toBe(Networks.PUBLIC);
    });
  });

  describe("horizonUrl", () => {
    test("🟢returns_undefined_when_not_set", () => {
      delete process.env.HORIZON_URL;
      expect(Env.horizonUrl).toBeUndefined();
    });

    test("🟢trims_whitespace", () => {
      process.env.HORIZON_URL = "  https://horizon.example.org  ";
      expect(Env.horizonUrl).toBe("https://horizon.example.org");
    });
  });

  describe("rpcUrl", () => {
    test("🟢returns_undefined_when_not_set", () => {
      delete process.env.RPC_URL;
      expect(Env.rpcUrl).toBeUndefined();
    });

    test("🟢trims_whitespace", () => {
      process.env.RPC_URL = "  https://rpc.example.org  ";
      expect(Env.rpcUrl).toBe("https://rpc.example.org");
    });
  });

  describe("sentryDsn", () => {
    test("🟢returns_undefined_when_not_set", () => {
      delete process.env.SENTRY_DSN;
      expect(Env.sentryDsn).toBeUndefined();
    });

    test("🟢returns_value_when_set", () => {
      process.env.SENTRY_DSN = "https://key@sentry.io/123";
      expect(Env.sentryDsn).toBe("https://key@sentry.io/123");
    });

    test("🟢trims_whitespace", () => {
      process.env.SENTRY_DSN = "  https://key@sentry.io/123  ";
      expect(Env.sentryDsn).toBe("https://key@sentry.io/123");
    });
  });

  describe("sentryEnvironment", () => {
    test("🟢defaults_to_nodeEnv_when_not_set", () => {
      delete process.env.SENTRY_ENVIRONMENT;
      process.env.NODE_ENV = "production";
      expect(Env.sentryEnvironment).toBe("production");
    });

    test("🟢defaults_to_development_when_neither_set", () => {
      delete process.env.SENTRY_ENVIRONMENT;
      delete process.env.NODE_ENV;
      expect(Env.sentryEnvironment).toBe("development");
    });

    test("🟢overrides_nodeEnv_when_explicitly_set", () => {
      process.env.SENTRY_ENVIRONMENT = "staging";
      process.env.NODE_ENV = "production";
      expect(Env.sentryEnvironment).toBe("staging");
    });

    test("🟢trims_whitespace", () => {
      process.env.SENTRY_ENVIRONMENT = "  preview  ";
      expect(Env.sentryEnvironment).toBe("preview");
    });
  });

  describe("gitCommit", () => {
    test("🟢returns_undefined_when_not_set", () => {
      delete process.env.GIT_COMMIT;
      expect(Env.gitCommit).toBeUndefined();
    });

    test("🟢returns_value_when_set", () => {
      process.env.GIT_COMMIT = "abc123def456";
      expect(Env.gitCommit).toBe("abc123def456");
    });

    test("🟢trims_whitespace", () => {
      process.env.GIT_COMMIT = "  abc123  ";
      expect(Env.gitCommit).toBe("abc123");
    });
  });

  describe("requiredString", () => {
    test("🔴throws_when_missing", () => {
      delete process.env.POSTGRES_CONNECTION_NAME;
      expect(() => Env.cloudSql).toThrow(
        "Missing required environment variable: POSTGRES_CONNECTION_NAME",
      );
    });
  });

  describe("googleCloudSqlIpType", () => {
    test("🟢defaults_to_PRIVATE_when_not_set", () => {
      delete process.env.GOOGLE_CLOUD_SQL_IP_TYPE;
      expect(Env.googleCloudSqlIpType).toBe("PRIVATE");
    });

    test("🟢accepts_PUBLIC_PRIVATE_PSC", () => {
      process.env.GOOGLE_CLOUD_SQL_IP_TYPE = "PUBLIC";
      expect(Env.googleCloudSqlIpType).toBe("PUBLIC");
      process.env.GOOGLE_CLOUD_SQL_IP_TYPE = "PRIVATE";
      expect(Env.googleCloudSqlIpType).toBe("PRIVATE");
      process.env.GOOGLE_CLOUD_SQL_IP_TYPE = "PSC";
      expect(Env.googleCloudSqlIpType).toBe("PSC");
    });

    test("🟢normalizes_case", () => {
      process.env.GOOGLE_CLOUD_SQL_IP_TYPE = "private";
      expect(Env.googleCloudSqlIpType).toBe("PRIVATE");
    });

    test("🔴throws_on_invalid_value", () => {
      process.env.GOOGLE_CLOUD_SQL_IP_TYPE = "INVALID";
      expect(() => Env.googleCloudSqlIpType).toThrow(
        'Invalid GOOGLE_CLOUD_SQL_IP_TYPE: "INVALID". Expected one of: PUBLIC, PRIVATE, PSC.',
      );
    });
  });

  describe("googleApplicationCredentials", () => {
    test("🔴throws_when_missing_in_cloud_sql_mode", () => {
      delete process.env.DATABASE_URL;
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      expect(() => Env.googleApplicationCredentials).toThrow(
        "Missing required environment variable: GOOGLE_APPLICATION_CREDENTIALS (required when using cloud_sql_connector_iam connection mode)",
      );
    });

    test("🟢returns_value_when_set", () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = "./creds.json";
      expect(Env.googleApplicationCredentials).toBe("./creds.json");
    });
  });
});
