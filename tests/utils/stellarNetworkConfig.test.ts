import { Networks } from "@stellar/stellar-sdk";

import { HttpError } from "../../src/utils/error";
import { StellarNetworkConfigService } from "../../src/utils/stellarNetworkConfig";

// The service keys its module-level cache off the normalized `rpcUrl` it stores,
// so asserting on that private field is the most direct way to prove that two
// spellings of the same endpoint share a cache entry.
const storedRpcUrl = (service: StellarNetworkConfigService): string =>
  (service as unknown as { rpcUrl: string }).rpcUrl;

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

  // The pairing is checked against the allowlist, not against the deployment's
  // NETWORK_PASSPHRASE, so the endpoint behaves the same on every instance.
  describe("network / rpc_url agreement", () => {
    it("accepts a mainnet URL for network=mainnet", () => {
      const service = new StellarNetworkConfigService({
        network: "mainnet",
        rpcUrl: allowlisted,
      });
      expect(service.networkPassphrase).toBe(Networks.PUBLIC);
    });

    it("accepts a testnet URL for network=testnet", () => {
      const service = new StellarNetworkConfigService({
        network: "testnet",
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
      expect(service.networkPassphrase).toBe(Networks.TESTNET);
      expect(storedRpcUrl(service)).toBe("https://soroban-testnet.stellar.org");
    });

    it("accepts a futurenet URL for network=futurenet", () => {
      const service = new StellarNetworkConfigService({
        network: "futurenet",
        rpcUrl: "https://rpc-futurenet.stellar.org",
      });
      expect(service.networkPassphrase).toBe(Networks.FUTURENET);
    });

    // The case the UI produces: user is on Testnet, pastes a Mainnet RPC URL.
    it("rejects a mainnet URL for network=testnet, naming both networks", () => {
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

    it("checks the pair regardless of NETWORK_PASSPHRASE", () => {
      const original = process.env.NETWORK_PASSPHRASE;
      try {
        // A deployment env that disagrees with both the request and the URL.
        process.env.NETWORK_PASSPHRASE = Networks.FUTURENET;
        const service = new StellarNetworkConfigService({
          network: "mainnet",
          rpcUrl: allowlisted,
        });
        expect(service.networkPassphrase).toBe(Networks.PUBLIC);

        expectHttpError(
          () =>
            new StellarNetworkConfigService({
              network: "testnet",
              rpcUrl: allowlisted,
            }),
          400,
        );
      } finally {
        if (original === undefined) {
          delete process.env.NETWORK_PASSPHRASE;
        } else {
          process.env.NETWORK_PASSPHRASE = original;
        }
      }
    });
  });
});
