import { describe, test, expect } from "vitest";
import {
  createMockRegistryClient,
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
