import { test, expect, describe, vi, afterEach } from "vitest";
import { downloadUrlCacheTtlMs, extractUrlExpiryMs } from "./download_url_cache";

// 2026-06-16T12:00:00Z, expressed timezone-independently.
const SIGNED_AT = Date.UTC(2026, 5, 16, 12, 0, 0);

describe("extractUrlExpiryMs", () => {
  test("AWS SigV4 URL (S3 / FS remote driver): X-Amz-Date + X-Amz-Expires", () => {
    const url =
      "https://bucket.s3.amazonaws.com/key?X-Amz-Algorithm=AWS4-HMAC-SHA256" +
      "&X-Amz-Date=20260616T120000Z&X-Amz-Expires=3600&X-Amz-Signature=deadbeef";
    expect(extractUrlExpiryMs(url)).toBe(SIGNED_AT + 3600_000);
  });

  test("GCS V4 signed URL: X-Goog-Date + X-Goog-Expires", () => {
    const url =
      "https://storage.googleapis.com/bucket/key?X-Goog-Algorithm=GOOG4-RSA-SHA256" +
      "&X-Goog-Date=20260616T120000Z&X-Goog-Expires=600&X-Goog-Signature=deadbeef";
    expect(extractUrlExpiryMs(url)).toBe(SIGNED_AT + 600_000);
  });

  test("the encoded timestamp is UTC, independent of host timezone", () => {
    // The compact form ends with 'Z' (Zulu/UTC); the result must equal the
    // UTC epoch and never shift by the runner's local offset.
    const url = "https://x/key?X-Amz-Date=20260101T000000Z&X-Amz-Expires=1&X-Amz-Signature=x";
    expect(extractUrlExpiryMs(url)).toBe(Date.UTC(2026, 0, 1, 0, 0, 0) + 1000);
  });

  test("local storage:// URL has no encoded expiry", () => {
    expect(extractUrlExpiryMs("storage://main/some/relative/path.json")).toBeUndefined();
  });

  test("plain URL without presign params has no expiry", () => {
    expect(extractUrlExpiryMs("https://example.com/file?foo=bar")).toBeUndefined();
  });

  test("malformed presign params yield null (present but invalid - do not cache)", () => {
    const url = "https://x/key?X-Amz-Date=not-a-date&X-Amz-Expires=3600&X-Amz-Signature=x";
    expect(extractUrlExpiryMs(url)).toBeNull();
  });

  test("non-URL input yields no expiry", () => {
    expect(extractUrlExpiryMs("not a url")).toBeUndefined();
  });
});

describe("downloadUrlCacheTtlMs", () => {
  // downloadUrlCacheTtlMs reads Date.now(); pin it so the TTL math is deterministic.
  afterEach(() => vi.useRealTimers());

  test("subtracts the 30s safety margin from the encoded expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(SIGNED_AT); // now = signing time -> raw remaining 3600s, minus 30s margin.
    const url = "https://x/key?X-Amz-Date=20260616T120000Z&X-Amz-Expires=3600&X-Amz-Signature=x";
    expect(downloadUrlCacheTtlMs(url)).toBe(3600_000 - 30_000);
  });

  test("returns non-positive when within the safety margin of expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(SIGNED_AT + 50_000); // 10s of life left -> after a 30s margin, not worth caching.
    const url = "https://x/key?X-Amz-Date=20260616T120000Z&X-Amz-Expires=60&X-Amz-Signature=x";
    expect(downloadUrlCacheTtlMs(url)).toBeLessThanOrEqual(0);
  });

  test("falls back to a positive default TTL for URLs without encoded expiry", () => {
    expect(downloadUrlCacheTtlMs("storage://main/path")).toBeGreaterThan(0);
  });
});
