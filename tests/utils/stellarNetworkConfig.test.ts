import { Networks } from "@stellar/stellar-sdk";

import { HttpError } from "../../src/utils/error";
import { StellarNetworkConfigService } from "../../src/utils/stellarNetworkConfig";

// The service keys its module-level cache off the normalized `rpcUrl` it
// stores, so asserting on that field is the most direct way to prove that two
// spellings of the same endpoint share a cache entry.
const storedRpcUrl = (service: StellarNetworkConfigService): string =>
  service.rpcUrl;

const expectHttpError = (fn: () => unknown, status: number): HttpError => {
  try {
    fn();
    expect.unreachable("expected the constructor to throw");
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(status);
    return err as HttpError;
  }
  throw new Error("unreachable");
};

describe("StellarNetworkConfigService (RPC URL handling)", () => {
  const allowlisted = "https://mainnet.sorobanrpc.com";
  const mainnet = { network: "mainnet" as const };
  const originalPassphrase = process.env.NETWORK_PASSPHRASE;

  beforeEach(() => {
    // The constructor now checks the requested network against the
    // deployment's own NETWORK_PASSPHRASE. Most tests exercise mainnet, so
    // the default deployment is mainnet; tests override this per case.
    process.env.NETWORK_PASSPHRASE = Networks.PUBLIC;
  });

  afterAll(() => {
    if (originalPassphrase === undefined) {
      delete process.env.NETWORK_PASSPHRASE;
    } else {
      process.env.NETWORK_PASSPHRASE = originalPassphrase;
    }
  });

  it("accepts an allowlisted URL with a trailing slash and normalizes it", () => {
    const service = new StellarNetworkConfigService({
      ...mainnet,
      rpcUrl: `${allowlisted}/`,
    });
    expect(storedRpcUrl(service)).toBe(allowlisted);
  });

  it("stores the same value for the slash and no-slash spellings (shared cache key)", () => {
    const withSlash = new StellarNetworkConfigService({
      ...mainnet,
      rpcUrl: `${allowlisted}/`,
    });
    const withoutSlash = new StellarNetworkConfigService({
      ...mainnet,
      rpcUrl: allowlisted,
    });
    expect(storedRpcUrl(withSlash)).toBe(storedRpcUrl(withoutSlash));
  });

  it("rejects a non-https URL with a 400", () => {
    expectHttpError(
      () =>
        new StellarNetworkConfigService({
          ...mainnet,
          rpcUrl: "http://mainnet.sorobanrpc.com",
        }),
      400,
    );
  });

  it("rejects a well-formed https URL that is not on the allowlist with a 400", () => {
    const err = expectHttpError(
      () =>
        new StellarNetworkConfigService({
          ...mainnet,
          rpcUrl: "https://evil.example.com",
        }),
      400,
    );
    expect(err.message).toMatch(/is not on the allowlist/);
  });

  // The route makes both params required; these are defense-in-depth for any
  // non-HTTP caller. Neither has a default to fall back to.
  it("rejects a missing rpcUrl with a 400 instead of defaulting to one", () => {
    const err = expectHttpError(
      () =>
        new StellarNetworkConfigService({
          ...mainnet,
          rpcUrl: undefined as unknown as string,
        }),
      400,
    );
    expect(err.message).toBe("rpc_url is required");
  });

  it("rejects an empty rpcUrl with a 400", () => {
    expectHttpError(
      () => new StellarNetworkConfigService({ ...mainnet, rpcUrl: "" }),
      400,
    );
  });

  it("rejects a missing network with a 400 instead of defaulting to one", () => {
    const err = expectHttpError(
      () =>
        new StellarNetworkConfigService({
          network: undefined as unknown as "mainnet",
          rpcUrl: allowlisted,
        }),
      400,
    );
    expect(err.message).toBe("network is required");
  });

  it("rejects an unrecognized network name with a 400", () => {
    const err = expectHttpError(
      () =>
        new StellarNetworkConfigService({
          network: "pubnet" as unknown as "mainnet",
          rpcUrl: allowlisted,
        }),
      400,
    );
    expect(err.message).toBe(
      "network must be one of: mainnet, testnet, futurenet",
    );
  });

  // The requested network must match the deployment's own NETWORK_PASSPHRASE:
  // each deployment serves exactly one network, so a request naming another
  // reached the wrong instance.
  describe("deployment network check", () => {
    it("rejects with a 500 when NETWORK_PASSPHRASE is not set", () => {
      delete process.env.NETWORK_PASSPHRASE;
      const err = expectHttpError(
        () =>
          new StellarNetworkConfigService({
            ...mainnet,
            rpcUrl: allowlisted,
          }),
        500,
      );
      expect(err.message).toMatch(/NETWORK_PASSPHRASE is not set/);
    });

    it("rejects a request naming another network than the deployment with a 400", () => {
      const err = expectHttpError(
        () =>
          new StellarNetworkConfigService({
            network: "testnet",
            rpcUrl: "https://soroban-testnet.stellar.org",
          }),
        400,
      );
      expect(err.message).toBe(
        "This deployment serves mainnet, but network=testnet was requested.",
      );
    });

    it("names an unrecognized deployment passphrase instead of a network", () => {
      process.env.NETWORK_PASSPHRASE = "Standalone Network ; February 2017";
      const err = expectHttpError(
        () =>
          new StellarNetworkConfigService({
            ...mainnet,
            rpcUrl: allowlisted,
          }),
        400,
      );
      expect(err.message).toContain("an unrecognized network");
      expect(err.message).toContain("network=mainnet was requested");
    });

    it("runs before the allowlist check and the testnet fallback", () => {
      // A mainnet deployment must not serve the testnet fallback — the
      // deployment check fires first even with rpc_url absent.
      const err = expectHttpError(
        () => new StellarNetworkConfigService({ network: "testnet" }),
        400,
      );
      expect(err.message).toBe(
        "This deployment serves mainnet, but network=testnet was requested.",
      );

      // ... and before an rpc_url that would otherwise fail the allowlist.
      const err2 = expectHttpError(
        () =>
          new StellarNetworkConfigService({
            network: "testnet",
            rpcUrl: "https://evil.example.com",
          }),
        400,
      );
      expect(err2.message).toMatch(/This deployment serves mainnet/);
    });
  });

  // Testnet is lenient about rpc_url: a missing value, a non-https URL, or an
  // https URL on no allowlist all resolve to the SDF testnet RPC. Only a URL
  // allowlisted for another network is still rejected.
  describe("testnet rpc_url fallback", () => {
    beforeEach(() => {
      process.env.NETWORK_PASSPHRASE = Networks.TESTNET;
    });

    it("falls back to the SDF testnet RPC when rpcUrl is missing", () => {
      const service = new StellarNetworkConfigService({ network: "testnet" });
      expect(storedRpcUrl(service)).toBe("https://soroban-testnet.stellar.org");
      expect(service.networkPassphrase).toBe(Networks.TESTNET);
    });

    it("falls back when rpcUrl is an http URL", () => {
      const service = new StellarNetworkConfigService({
        network: "testnet",
        rpcUrl: "http://soroban-testnet.stellar.org",
      });
      expect(storedRpcUrl(service)).toBe("https://soroban-testnet.stellar.org");
    });

    it("falls back when rpcUrl is well-formed but on no allowlist", () => {
      const service = new StellarNetworkConfigService({
        network: "testnet",
        rpcUrl: "https://evil.example.com",
      });
      expect(storedRpcUrl(service)).toBe("https://soroban-testnet.stellar.org");
    });

    it("uses an allowlisted testnet URL as given", () => {
      const service = new StellarNetworkConfigService({
        network: "testnet",
        rpcUrl: "https://soroban-rpc.testnet.stellar.gateway.fm/",
      });
      expect(storedRpcUrl(service)).toBe(
        "https://soroban-rpc.testnet.stellar.gateway.fm",
      );
    });

    it("still rejects a URL allowlisted for another network", () => {
      const err = expectHttpError(
        () =>
          new StellarNetworkConfigService({
            network: "testnet",
            rpcUrl: allowlisted,
          }),
        400,
      );
      expect(err.message).toMatch(
        /serves mainnet, but network=testnet was requested/,
      );
    });
  });

  // On top of the deployment check, the pairing of network and rpc_url is
  // checked against the allowlist, so a mismatched pair is rejected rather
  // than silently answered with the other network's limits.
  describe("network / rpc_url agreement", () => {
    it("accepts a mainnet URL for network=mainnet", () => {
      const service = new StellarNetworkConfigService({
        network: "mainnet",
        rpcUrl: allowlisted,
      });
      expect(service.networkPassphrase).toBe(Networks.PUBLIC);
    });

    it("accepts a testnet URL for network=testnet", () => {
      process.env.NETWORK_PASSPHRASE = Networks.TESTNET;
      const service = new StellarNetworkConfigService({
        network: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      expect(service.networkPassphrase).toBe(Networks.TESTNET);
      expect(storedRpcUrl(service)).toBe("https://soroban-testnet.stellar.org");
    });

    // There is no futurenet deployment, so a futurenet request always reaches
    // a mainnet or testnet deployment and is rejected.
    it("rejects network=futurenet on a mainnet deployment", () => {
      const err = expectHttpError(
        () =>
          new StellarNetworkConfigService({
            network: "futurenet",
            rpcUrl: "https://rpc-futurenet.stellar.org",
          }),
        400,
      );
      expect(err.message).toBe(
        "This deployment serves mainnet, but network=futurenet was requested.",
      );
    });

    // The case the UI produces: user is on Testnet, pastes a Mainnet RPC URL.
    it("rejects a mainnet URL for network=testnet, naming both networks", () => {
      process.env.NETWORK_PASSPHRASE = Networks.TESTNET;
      const err = expectHttpError(
        () =>
          new StellarNetworkConfigService({
            network: "testnet",
            rpcUrl: allowlisted,
          }),
        400,
      );
      expect(err.message).toMatch(
        /serves mainnet, but network=testnet was requested/,
      );
      // The message points at what the caller can actually use instead.
      expect(err.message).toContain("https://soroban-testnet.stellar.org");
    });

    it("rejects a testnet URL for network=mainnet", () => {
      const err = expectHttpError(
        () =>
          new StellarNetworkConfigService({
            ...mainnet,
            rpcUrl: "https://soroban-testnet.stellar.org",
          }),
        400,
      );
      expect(err.message).toMatch(
        /serves testnet, but network=mainnet was requested/,
      );
    });

    it("rejects the pair when the deployment serves another network", () => {
      // A testnet deployment must refuse a mainnet request even though the
      // network/rpc_url pair is itself consistent.
      process.env.NETWORK_PASSPHRASE = Networks.TESTNET;
      const err = expectHttpError(
        () =>
          new StellarNetworkConfigService({
            network: "mainnet",
            rpcUrl: allowlisted,
          }),
        400,
      );
      expect(err.message).toBe(
        "This deployment serves testnet, but network=mainnet was requested.",
      );
    });
  });
});
