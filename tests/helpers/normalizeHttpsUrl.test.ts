import { normalizeHttpsUrl } from "../../src/helpers/normalizeHttpsUrl";
import { HttpError } from "../../src/utils/error";

describe("normalizeHttpsUrl", () => {
  describe("trailing-slash canonicalization", () => {
    it("strips a trailing slash from a bare-host URL", () => {
      expect(normalizeHttpsUrl("https://mainnet.sorobanrpc.com/")).toBe(
        "https://mainnet.sorobanrpc.com",
      );
    });

    it("leaves a bare-host URL without a trailing slash unchanged", () => {
      // new URL() appends a slash to the root path; the helper strips it back
      // off so this input round-trips to itself.
      expect(normalizeHttpsUrl("https://mainnet.sorobanrpc.com")).toBe(
        "https://mainnet.sorobanrpc.com",
      );
    });

    it("collapses a URL with and without a trailing slash to one form", () => {
      expect(normalizeHttpsUrl("https://mainnet.sorobanrpc.com/")).toBe(
        normalizeHttpsUrl("https://mainnet.sorobanrpc.com"),
      );
    });

    it("strips multiple trailing slashes", () => {
      expect(normalizeHttpsUrl("https://mainnet.sorobanrpc.com//")).toBe(
        "https://mainnet.sorobanrpc.com",
      );
    });

    it("strips a trailing slash from a path-bearing URL", () => {
      expect(
        normalizeHttpsUrl("https://stellar.api.onfinality.io/public/"),
      ).toBe("https://stellar.api.onfinality.io/public");
    });

    it("preserves a path-bearing URL that has no trailing slash", () => {
      expect(normalizeHttpsUrl("https://rpc.ankr.com/stellar_soroban")).toBe(
        "https://rpc.ankr.com/stellar_soroban",
      );
    });

    it("is idempotent", () => {
      const once = normalizeHttpsUrl("https://mainnet.sorobanrpc.com/");
      expect(normalizeHttpsUrl(once)).toBe(once);
    });
  });

  describe("URL-spec canonicalization (case-insensitive host/scheme, default port)", () => {
    it("lower-cases the scheme and host", () => {
      expect(normalizeHttpsUrl("HTTPS://Mainnet.SorobanRPC.com/")).toBe(
        "https://mainnet.sorobanrpc.com",
      );
    });

    it("drops the default https port (443)", () => {
      expect(normalizeHttpsUrl("https://mainnet.sorobanrpc.com:443")).toBe(
        "https://mainnet.sorobanrpc.com",
      );
    });
  });

  describe("https enforcement", () => {
    it("rejects an http URL with a 400", () => {
      try {
        normalizeHttpsUrl("http://mainnet.sorobanrpc.com");
        expect.unreachable("expected normalizeHttpsUrl to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(HttpError);
        expect((err as HttpError).status).toBe(400);
      }
    });

    it("rejects a non-http(s) scheme with a 400", () => {
      try {
        normalizeHttpsUrl("ftp://mainnet.sorobanrpc.com");
        expect.unreachable("expected normalizeHttpsUrl to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(HttpError);
        expect((err as HttpError).status).toBe(400);
      }
    });

    it("does not upgrade http to https (it rejects instead)", () => {
      // Guards against a normalization that silently rewrites the scheme, which
      // would let an http origin sneak past the all-https allowlist.
      expect(() => normalizeHttpsUrl("http://mainnet.sorobanrpc.com")).toThrow(
        HttpError,
      );
    });
  });

  describe("invalid input", () => {
    it.each(["", "not a url", "://missing-scheme", "https://"])(
      "rejects %j with a 400",
      input => {
        try {
          normalizeHttpsUrl(input);
          expect.unreachable("expected normalizeHttpsUrl to throw");
        } catch (err) {
          expect(err).toBeInstanceOf(HttpError);
          expect((err as HttpError).status).toBe(400);
        }
      },
    );
  });
});
