import { describe, test, expect } from "vitest";
import { ensureCatalogLatest, withManagedYaml } from "../../content-rules";
import { parseYaml, stringifyYaml } from "../../parsers/yaml";
import {
  createMockRegistryClient,
  makeSyncLookup,
  prefetchLatestVersions,
} from "../../registry-client";

async function lookupFor(versions: Record<string, string>) {
  const client = createMockRegistryClient(versions);
  const resolved = await prefetchLatestVersions(client, Object.keys(versions));
  return makeSyncLookup(resolved);
}

describe("ensureCatalogLatest (mocked registry)", () => {
  test("overwrites a present entry with the resolved latest", async () => {
    const doc = parseYaml("catalog:\n  '@platforma-sdk/model': 1.0.0\n");
    const getLatestVersion = await lookupFor({ "@platforma-sdk/model": "2.0.0" });
    withManagedYaml(doc, () => ensureCatalogLatest("@platforma-sdk/model"), { getLatestVersion });
    const cat = (doc.toJSON() as { catalog: Record<string, string> }).catalog;
    expect(cat["@platforma-sdk/model"]).toBe("2.0.0");
  });

  test("add-if-absent: seeds a missing key from the resolved latest (the FC-3 fix)", async () => {
    const doc = parseYaml("catalog:\n  unrelated: 9.9.9\n");
    const getLatestVersion = await lookupFor({ "@milaboratories/ts-builder": "3.4.5" });
    withManagedYaml(doc, () => ensureCatalogLatest("@milaboratories/ts-builder"), {
      getLatestVersion,
    });
    const cat = (doc.toJSON() as { catalog: Record<string, string> }).catalog;
    expect(cat["@milaboratories/ts-builder"]).toBe("3.4.5");
    expect(cat.unrelated).toBe("9.9.9");
  });

  test("no-op when getLatestVersion is not provided (default refresh)", () => {
    const doc = parseYaml("catalog:\n  '@platforma-sdk/model': 1.0.0\n");
    withManagedYaml(doc, () => ensureCatalogLatest("@platforma-sdk/model"));
    const cat = (doc.toJSON() as { catalog: Record<string, string> }).catalog;
    expect(cat["@platforma-sdk/model"]).toBe("1.0.0");
  });

  test("no-op when the name was not prefetched (lookup returns undefined)", async () => {
    const doc = parseYaml("catalog:\n  '@platforma-sdk/model': 1.0.0\n");
    const getLatestVersion = await lookupFor({ "@platforma-sdk/other": "2.0.0" });
    // The present key has no prefetched latest → left untouched, and an
    // absent unprefetched key is not added.
    withManagedYaml(
      doc,
      () => {
        ensureCatalogLatest("@platforma-sdk/model");
        ensureCatalogLatest("@platforma-sdk/missing");
      },
      { getLatestVersion },
    );
    const cat = (doc.toJSON() as { catalog: Record<string, string> }).catalog;
    expect(cat["@platforma-sdk/model"]).toBe("1.0.0");
    expect(cat["@platforma-sdk/missing"]).toBeUndefined();
  });

  test("idempotent — second run produces the same YAML", async () => {
    const doc = parseYaml("catalog:\n  '@platforma-sdk/model': 1.0.0\n");
    const getLatestVersion = await lookupFor({ "@platforma-sdk/model": "2.0.0" });
    withManagedYaml(doc, () => ensureCatalogLatest("@platforma-sdk/model"), { getLatestVersion });
    const once = stringifyYaml(doc);
    withManagedYaml(doc, () => ensureCatalogLatest("@platforma-sdk/model"), { getLatestVersion });
    const twice = stringifyYaml(doc);
    expect(twice).toBe(once);
  });
});
