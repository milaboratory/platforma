// `buildRegistryLookupForNames` — the shared prefetch helper used by
// `init` (names from the SDK pin map) and `refresh --update-deps-only`
// (names from the on-disk catalog). Mocked client; no network.

import { describe, test, expect } from "vitest";
import {
  buildRegistryLookupForNames,
  matchesBumpPattern,
  createMockRegistryClient,
} from "../registry-client";

describe("buildRegistryLookupForNames", () => {
  test("empty name list → lookup resolves nothing, never touches the client", async () => {
    // A client that would throw if asked — proves no call is made.
    const throwing = createMockRegistryClient({});
    const lookup = await buildRegistryLookupForNames([], throwing);
    expect(lookup("@platforma-sdk/model")).toBeUndefined();
  });

  test("resolves each requested name to the client's latest", async () => {
    const client = createMockRegistryClient({
      "@platforma-sdk/model": "1.77.17",
      "@platforma-sdk/test": "1.77.17",
    });
    const lookup = await buildRegistryLookupForNames(
      ["@platforma-sdk/model", "@platforma-sdk/test"],
      client,
    );
    expect(lookup("@platforma-sdk/model")).toBe("1.77.17");
    expect(lookup("@platforma-sdk/test")).toBe("1.77.17");
    expect(lookup("unknown")).toBeUndefined();
  });

  test("REJECTS when the registry fails — this is init's require-network abort path", async () => {
    // Mock client throws for any unconfigured name (simulates registry down).
    const down = createMockRegistryClient({});
    await expect(buildRegistryLookupForNames(["@platforma-sdk/model"], down)).rejects.toThrow(
      /no version configured/,
    );
  });

  test("matchesBumpPattern selects the SDK families only", () => {
    expect(matchesBumpPattern("@platforma-sdk/model")).toBe(true);
    expect(matchesBumpPattern("@milaboratories/ts-builder")).toBe(true);
    expect(matchesBumpPattern("turbo")).toBe(false);
    expect(matchesBumpPattern("shx")).toBe(false);
    expect(matchesBumpPattern("@platforma-open/milaboratories.runenv-python-3")).toBe(false);
  });
});
