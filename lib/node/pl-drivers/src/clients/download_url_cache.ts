import { LRUCache } from "lru-cache";
import type { SignedResourceId } from "@milaboratories/pl-client";
import type { MiLogger } from "@milaboratories/ts-helpers";
import type { DownloadAPI_GetDownloadURL_Response } from "../proto-grpc/github.com/milaboratory/pl/controllers/shared/grpc/downloadapi/protocol";

/**
 * Safety margin subtracted from the encoded URL expiry. Covers clock skew
 * between this host and pl-core (the timestamp is the server's signing clock,
 * not ours) plus in-flight time between signing and use.
 */
const SAFETY_MARGIN_MS = 30_000;

/**
 * TTL applied to download URLs that carry no expiry in their query string -
 * notably local `storage://` URLs, which are deterministic for a given resource
 * and effectively never expire. Bounded so a changed storage projection is
 * eventually re-resolved.
 */
const NO_EXPIRY_DEFAULT_TTL_MS = 60 * 60 * 1000; // 1h

/** Max number of cached {url, headers} entries. Each entry is tiny. */
const DEFAULT_MAX_ENTRIES = 4096;

/**
 * Extracts the absolute expiry time (epoch ms) encoded in a presigned download
 * URL, or `undefined` if the URL carries no expiry.
 *
 * Supports AWS SigV4 (`X-Amz-Date` + `X-Amz-Expires`, used by pl's S3 and FS
 * remote drivers) and GCS V4 (`X-Goog-Date` + `X-Goog-Expires`). Both encode
 * the date as a compact ISO-8601 UTC timestamp `YYYYMMDDTHHMMSSZ` (trailing `Z`
 * = Zulu/UTC; verified against pl `util/storage/v4sign/presigner.go`) and the
 * lifetime as integer seconds.
 */
export function extractUrlExpiryMs(url: string): number | null | undefined {
  let query: URLSearchParams;
  try {
    query = new URL(url).searchParams;
  } catch {
    return undefined;
  }

  for (const prefix of ["X-Amz", "X-Goog"]) {
    const date = query.get(`${prefix}-Date`);
    const expires = query.get(`${prefix}-Expires`);
    if (date === null || expires === null) continue;

    const signedAtMs = parseCompactIso8601Utc(date);
    const expiresSec = Number(expires);
    if (signedAtMs === undefined || !Number.isFinite(expiresSec) || expiresSec <= 0) return null;

    return signedAtMs + expiresSec * 1000;
  }

  return undefined;
}

/**
 * Parses a compact ISO-8601 UTC timestamp `YYYYMMDDTHHMMSSZ` into epoch ms.
 * `new Date()` cannot parse the compact form, so we expand it to the extended
 * form `YYYY-MM-DDTHH:MM:SSZ`; the trailing `Z` makes it UTC regardless of the
 * host's local timezone.
 */
function parseCompactIso8601Utc(value: string): number | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (m === null) return undefined;
  const [, y, mo, d, h, mi, s] = m;
  const ms = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * Computes the cache TTL (ms from now) for a download URL, with the safety
 * margin already subtracted. Returns a non-positive number when the URL is
 * already within the margin of expiring - the caller should then skip caching.
 */
export function downloadUrlCacheTtlMs(url: string): number {
  const expiry = extractUrlExpiryMs(url);
  if (expiry === null) return 0;
  if (expiry === undefined) return NO_EXPIRY_DEFAULT_TTL_MS;
  return expiry - Date.now() - SAFETY_MARGIN_MS;
}

/**
 * LRU cache of `GetDownloadURL` responses keyed by `SignedResourceId`. Each
 * entry's TTL is derived from the expiry encoded in the presigned URL (minus a
 * safety margin), so an entry never outlives the URL it holds.
 *
 * Note: the key intentionally omits `isInternalUse` because the only caller
 * always requests `isInternalUse: false`. Revisit if that ever varies.
 */
export class DownloadUrlCache {
  private readonly cache: LRUCache<SignedResourceId, DownloadAPI_GetDownloadURL_Response>;

  constructor(
    private readonly logger: MiLogger,
    maxEntries: number = DEFAULT_MAX_ENTRIES,
  ) {
    this.cache = new LRUCache<SignedResourceId, DownloadAPI_GetDownloadURL_Response>({
      max: maxEntries,
      // URL expiry is absolute, not sliding - do not extend TTL on access.
      updateAgeOnGet: false,
    });
  }

  get(key: SignedResourceId): DownloadAPI_GetDownloadURL_Response | undefined {
    return this.cache.get(key);
  }

  set(key: SignedResourceId, value: DownloadAPI_GetDownloadURL_Response): void {
    const ttl = downloadUrlCacheTtlMs(value.downloadUrl);
    if (ttl <= 0) return; // Cache miss.
    this.cache.set(key, value, { ttl });
  }

  delete(key: SignedResourceId): void {
    this.cache.delete(key);
  }
}
