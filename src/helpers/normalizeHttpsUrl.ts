import { HttpError } from "../utils/error";

/**
 * Canonicalize an HTTPS URL so that trailing-slash variants collapse to a single
 * form — used both as the cache key and for the exact allowlist comparison, so
 * "https://host" and "https://host/" resolve to the same cache entry.
 * Also enforces https: anything else is rejected before it can reach the RPC
 *
 * `new URL()` can only ever collapse an input to one of the canonical
 * allowlisted strings or leave it un-matchable — it cannot cross hosts — so
 * this does not widen what the allowlist accepts.
 */
export const normalizeHttpsUrl = (rawUrl: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new HttpError(`Invalid URL: "${rawUrl}"`, 400);
  }
  if (parsed.protocol !== "https:") {
    throw new HttpError(`URL must use https: "${rawUrl}"`, 400);
  }
  // new URL() adds a trailing slash to a bare-host URL ("https://x" ->
  // "https://x/"); strip any trailing slashes so both variants share one form.
  return parsed.href.replace(/\/+$/, "");
};
