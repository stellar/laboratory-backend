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

  describe("environment", () => {
    test("🟢defaults_to_development_when_not_set", () => {
      delete process.env.ENVIRONMENT;
      expect(Env.environment).toBe("development");
    });

    test("🟢returns_value_when_set", () => {
      process.env.ENVIRONMENT = "prd-testnet";
      expect(Env.environment).toBe("prd-testnet");
    });

    test("🟢trims_whitespace", () => {
      process.env.ENVIRONMENT = "  dev-pubnet  ";
      expect(Env.environment).toBe("dev-pubnet");
    });
  });

  describe("debug", () => {
    test("🟢returns_false_when_not_set", () => {
      delete process.env.DEBUG;
      expect(Env.debug).toBe(false);
    });

    test("🟢returns_true_for_true_1_yes", () => {
      for (const v of ["true", "1", "yes"]) {
        process.env.DEBUG = v;
        expect(Env.debug).toBe(true);
      }
    });

    test("🟢is_case_insensitive_and_trims_whitespace", () => {
      process.env.DEBUG = " TRUE";
      expect(Env.debug).toBe(true);
      process.env.DEBUG = " Yes ";
      expect(Env.debug).toBe(true);
    });

    test("🟡returns_false_for_other_values", () => {
      process.env.DEBUG = "false";
      expect(Env.debug).toBe(false);
      process.env.DEBUG = "0";
      expect(Env.debug).toBe(false);
    });
  });

  describe("nodeEnv", () => {
    test("🟢has no default value", () => {
      delete process.env.NODE_ENV;
      expect(Env.nodeEnv).toBeUndefined();
    });

    test("🟢returns_value_when_set", () => {
      process.env.NODE_ENV = "production";
      expect(Env.nodeEnv).toBe("production");
    });

    test("🟢trims_whitespace", () => {
      process.env.NODE_ENV = "  development  ";
      expect(Env.nodeEnv).toBe("development");
    });

    test("🟡returns_undefined_for_empty_string", () => {
      process.env.NODE_ENV = "  \t\n\r";
      expect(Env.nodeEnv).toBeUndefined();
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
      process.env.SENTRY_DSN = "https://key@sentry.example.com/123";
      expect(Env.sentryDsn).toBe("https://key@sentry.example.com/123");
    });

    test("🟢trims_whitespace", () => {
      process.env.SENTRY_DSN = "  https://key@sentry.example.com/123  ";
      expect(Env.sentryDsn).toBe("https://key@sentry.example.com/123");
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

  describe("logLevel", () => {
    test("🟢defaults_to_info_when_not_set", () => {
      delete process.env.LOG_LEVEL;
      expect(Env.logLevel).toBe("info");
    });

    test("🟢returns_value_when_set", () => {
      process.env.LOG_LEVEL = "debug";
      expect(Env.logLevel).toBe("debug");
    });

    test("🟢normalizes_to_lowercase", () => {
      process.env.LOG_LEVEL = "WARN";
      expect(Env.logLevel).toBe("warn");
    });

    test("🟢trims_whitespace", () => {
      process.env.LOG_LEVEL = "  error  ";
      expect(Env.logLevel).toBe("error");
    });

    test("🔴throws_on_invalid_value", () => {
      process.env.LOG_LEVEL = "verbose";
      expect(() => Env.logLevel).toThrow(
        'Invalid LOG_LEVEL: "verbose". Expected one of: trace, debug, info, warn, error, fatal.',
      );
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

  describe("corsOrigins", () => {
    test("🟢allows_all_origins_when_not_set", () => {
      delete process.env.CORS_ORIGINS;
      expect(Env.corsOrigins).toBe(true);
    });

    test("🟢parses_plain_string_origins", () => {
      process.env.CORS_ORIGINS =
        "https://app.example.com,https://other.example.com";
      expect(Env.corsOrigins).toEqual([
        "https://app.example.com",
        "https://other.example.com",
      ]);
    });

    test("🟢parses_regex_patterns", () => {
      process.env.CORS_ORIGINS = "/^https:\\/\\/.*\\.example\\.com$/";
      const origins = Env.corsOrigins as (string | RegExp)[];
      expect(origins).toHaveLength(1);
      expect(origins[0]).toBeInstanceOf(RegExp);
      expect((origins[0] as RegExp).test("https://app.example.com")).toBe(true);
      expect((origins[0] as RegExp).test("http://app.example.com")).toBe(false);
    });

    test("🟢regex_allows_matching_and_rejects_non_matching", () => {
      process.env.CORS_ORIGINS =
        "/^https:\\/\\/.*\\.services\\.example\\.com$/";
      const regex = (Env.corsOrigins as (string | RegExp)[])[0] as RegExp;
      expect(regex.test("https://foo.services.example.com")).toBe(true);
      expect(regex.test("https://bar.services.example.com")).toBe(true);
      expect(regex.test("https://foo.services.example.net")).toBe(false);
      expect(regex.test("http://foo.services.example.com")).toBe(false);
    });

    test("🟢handles_mixed_strings_and_regex", () => {
      process.env.CORS_ORIGINS =
        "https://app.example.com,/^https:\\/\\/.*\\.preview\\.example\\.com$/";
      const origins = Env.corsOrigins as (string | RegExp)[];
      expect(origins).toHaveLength(2);
      expect(origins[0]).toBe("https://app.example.com");
      expect(origins[1]).toBeInstanceOf(RegExp);
    });

    test("🟢trims_whitespace_and_filters_empty", () => {
      process.env.CORS_ORIGINS =
        " https://app.example.com , , https://other.example.com ";
      expect(Env.corsOrigins).toEqual([
        "https://app.example.com",
        "https://other.example.com",
      ]);
    });

    test("🔴throws_on_invalid_regex", () => {
      process.env.CORS_ORIGINS = "/[invalid(/";
      expect(() => Env.corsOrigins).toThrow(
        'Invalid regex in CORS_ORIGINS: "/[invalid(/"',
      );
    });

    test("warns_when_regex_is_not_anchored", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();
      process.env.CORS_ORIGINS = "/example\\.com/";
      void Env.corsOrigins;
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("not anchored"),
      );
      warnSpy.mockRestore();
    });

    test("does_not_warn_when_regex_is_properly_anchored", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();
      process.env.CORS_ORIGINS = "/^https:\\/\\/.*\\.example\\.com$/";
      void Env.corsOrigins;
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("pathPrefix", () => {
    test("🟢returns_undefined_when_not_set", () => {
      delete process.env.PATH_PREFIX;
      expect(Env.pathPrefix).toBeUndefined();
    });

    test("🟢returns_value_when_set", () => {
      process.env.PATH_PREFIX = "/pubnet";
      expect(Env.pathPrefix).toBe("/pubnet");
    });

    test("🟢trims_whitespace", () => {
      process.env.PATH_PREFIX = "  /testnet  ";
      expect(Env.pathPrefix).toBe("/testnet");
    });

    test("🟡returns_undefined_for_empty_string", () => {
      process.env.PATH_PREFIX = "";
      expect(Env.pathPrefix).toBeUndefined();
    });

    test("🟢normalizes_trailing_slash", () => {
      process.env.PATH_PREFIX = "/pubnet/";
      expect(Env.pathPrefix).toBe("/pubnet");
    });

    test("🟢normalizes_missing_leading_slash", () => {
      process.env.PATH_PREFIX = "pubnet";
      expect(Env.pathPrefix).toBe("/pubnet");
    });

    test("🟡returns_undefined_for_root_slash_only", () => {
      process.env.PATH_PREFIX = "/";
      expect(Env.pathPrefix).toBeUndefined();
    });
  });

  describe("trustProxy", () => {
    test("🟢returns_defaults_when_not_set", () => {
      delete process.env.TRUST_PROXY;
      expect(Env.trustProxy).toEqual(["loopback", "linklocal", "uniquelocal"]);
    });

    test("🟢parses_comma_separated_CIDRs", () => {
      process.env.TRUST_PROXY = "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16";
      expect(Env.trustProxy).toEqual([
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
      ]);
    });

    test("🟢trims_whitespace_and_filters_empty", () => {
      process.env.TRUST_PROXY = " loopback , , linklocal ";
      expect(Env.trustProxy).toEqual(["loopback", "linklocal"]);
    });

    test("🟢handles_single_value", () => {
      process.env.TRUST_PROXY = "10.0.0.0/8";
      expect(Env.trustProxy).toEqual(["10.0.0.0/8"]);
    });
  });
});
