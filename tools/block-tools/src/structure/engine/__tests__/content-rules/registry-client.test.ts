import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// Stub the backoff sleep so the 503-retry path runs instantly (no real
// ~1.5s of exponential backoff). Only registry-client's `sleep` import is
// affected; the helper tests below don't touch timers.
vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));

import {
  createMockRegistryClient,
  createRealRegistryClient,
  makeSyncLookup,
  parseRetryAfter,
  prefetchLatestVersions,
} from "../../registry-client";

describe("registry-client (mock + helpers)", () => {
  test("mock client returns configured versions", async () => {
    const c = createMockRegistryClient({ "@platforma-sdk/model": "2.0.0" });
    expect(await c.getLatestVersion("@platforma-sdk/model")).toBe("2.0.0");
  });

  test("mock client throws on unknown package", async () => {
    const c = createMockRegistryClient({});
    await expect(c.getLatestVersion("nope")).rejects.toThrow(/no version configured/);
  });

  test("prefetchLatestVersions resolves the requested names in parallel", async () => {
    const c = createMockRegistryClient({ a: "1.0.0", b: "2.0.0" });
    const m = await prefetchLatestVersions(c, ["a", "b"]);
    expect(m.get("a")).toBe("1.0.0");
    expect(m.get("b")).toBe("2.0.0");
    expect(m.size).toBe(2);
  });

  test("makeSyncLookup wraps a map as a sync getter, returning undefined for misses", () => {
    const lookup = makeSyncLookup(new Map([["a", "1.0.0"]]));
    expect(lookup("a")).toBe("1.0.0");
    expect(lookup("missing")).toBeUndefined();
  });

  test("parseRetryAfter handles delay-seconds form", () => {
    expect(parseRetryAfter("120")).toBe(120_000);
  });

  test("parseRetryAfter handles HTTP-date form", () => {
    const date = new Date(Date.now() + 5_000).toUTCString();
    const ms = parseRetryAfter(date);
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThan(0);
    expect(ms!).toBeLessThanOrEqual(5_000 + 200);
  });

  test("parseRetryAfter returns null on missing/invalid header", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("not-a-date-or-seconds")).toBeNull();
  });
});

describe("fetchWithRetry (via real client) — retry policy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Minimal Response stand-in: `fetchWithRetry` only reads `.ok`,
   *  `.status`, and `.headers.get(...)`. */
  function fakeResponse(status: number): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
    } as unknown as Response;
  }

  test("non-retryable status (404) throws after exactly ONE fetch — no retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(404));
    vi.stubGlobal("fetch", fetchMock);
    const client = createRealRegistryClient();
    await expect(client.getLatestVersion("@platforma-sdk/model")).rejects.toThrow(/HTTP 404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("retryable status (503) retries then throws — exactly 1 + RETRY_COUNT fetches", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(503));
    vi.stubGlobal("fetch", fetchMock);
    const client = createRealRegistryClient();
    await expect(client.getLatestVersion("@platforma-sdk/model")).rejects.toThrow(/HTTP 503/);
    // RETRY_COUNT = 2 → 3 total attempts.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("transient transport error retries then propagates — exactly 1 + RETRY_COUNT fetches", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    const client = createRealRegistryClient();
    await expect(client.getLatestVersion("@platforma-sdk/model")).rejects.toThrow(/network down/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("success on first try — one fetch, parsed dist-tag returned", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ latest: "9.9.9" }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    const client = createRealRegistryClient();
    expect(await client.getLatestVersion("@platforma-sdk/model")).toBe("9.9.9");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
