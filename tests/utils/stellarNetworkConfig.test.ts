import { Networks } from "@stellar/stellar-sdk";

import { HttpError } from "../../src/utils/error";
import {
  PUBLIC_RPC_URLS,
  StellarNetworkConfigService,
} from "../../src/utils/stellarNetworkConfig";

// The service keys its module-level cache off the normalized `rpcUrl` it stores,
// so asserting on that private field is the most direct way to prove that two
// spellings of the same endpoint share a cache entry.
const storedRpcUrl = (service: StellarNetworkConfigService): string =>
  (service as unknown as { rpcUrl: string }).rpcUrl;

describe("StellarNetworkConfigService (RPC URL handling)", () => {
  const allowlisted = "https://mainnet.sorobanrpc.com";

  it("accepts an allowlisted URL with a trailing slash and normalizes it", () => {
    const service = new StellarNetworkConfigService({
      networkPassphrase: Networks.PUBLIC,
      rpcUrl: `${allowlisted}/`,
    });
    expect(storedRpcUrl(service)).toBe(allowlisted);
  });

  it("stores the same value for the slash and no-slash spellings (shared cache key)", () => {
    const withSlash = new StellarNetworkConfigService({
      networkPassphrase: Networks.PUBLIC,
      rpcUrl: `${allowlisted}/`,
    });
    const withoutSlash = new StellarNetworkConfigService({
      networkPassphrase: Networks.PUBLIC,
      rpcUrl: allowlisted,
    });
    expect(storedRpcUrl(withSlash)).toBe(storedRpcUrl(withoutSlash));
  });

  it("rejects a non-https URL with a 400", () => {
    try {
      new StellarNetworkConfigService({
        networkPassphrase: Networks.PUBLIC,
        rpcUrl: "http://mainnet.sorobanrpc.com",
      });
      expect.unreachable("expected the constructor to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(400);
    }
  });

  it("rejects a well-formed https URL that is not on the allowlist with a 400", () => {
    try {
      new StellarNetworkConfigService({
        networkPassphrase: Networks.PUBLIC,
        rpcUrl: "https://evil.example.com",
      });
      expect.unreachable("expected the constructor to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(400);
    }
  });

  it("falls back to the network default when no rpcUrl is given", () => {
    const service = new StellarNetworkConfigService({
      networkPassphrase: Networks.PUBLIC,
    });
    expect(storedRpcUrl(service)).toBe(PUBLIC_RPC_URLS[Networks.PUBLIC][0]);
  });

  it("throws for an unsupported network passphrase with no rpcUrl", () => {
    expect(
      () =>
        new StellarNetworkConfigService({
          networkPassphrase: "not a real passphrase",
        }),
    ).toThrow();
  });
});
