import { describe, test, expect } from "vitest";
import { bumpCatalogToLatest, pinCatalogTo, withManagedYaml } from "../../content-rules";
import { parseYaml, stringifyYaml } from "../../parsers/yaml";
import {
  createMockRegistryClient,
  makeSyncLookup,
  prefetchLatestVersions,
} from "../../registry-client";

describe("pinCatalogTo", () => {
  test("sets an exact version on an existing catalog entry", () => {
    const doc = parseYaml("catalog:\n  '@platforma-sdk/some': 1.0.0\n");
    withManagedYaml(doc, () => pinCatalogTo("@platforma-sdk/some", "1.42.3"));
    const cat = (doc.toJSON() as { catalog: Record<string, string> }).catalog;
    expect(cat["@platforma-sdk/some"]).toBe("1.42.3");
  });

  test("creates the entry if missing", () => {
    const doc = parseYaml("catalog: {}\n");
    withManagedYaml(doc, () => pinCatalogTo("@platforma-sdk/new", "0.1.0"));
    const cat = (doc.toJSON() as { catalog: Record<string, string> }).catalog;
    expect(cat["@platforma-sdk/new"]).toBe("0.1.0");
  });

  test("declared-last wins: pin overrides bumpCatalogToLatest", async () => {
    const doc = parseYaml(
      ["catalog:", "  '@platforma-sdk/model': 1.0.0", "  '@platforma-sdk/lock': 1.0.0"].join("\n") +
        "\n",
    );
    const client = createMockRegistryClient({
      "@platforma-sdk/model": "9.9.9",
      "@platforma-sdk/lock": "9.9.9",
    });
    const resolved = await prefetchLatestVersions(client, [
      "@platforma-sdk/model",
      "@platforma-sdk/lock",
    ]);
    const getLatestVersion = makeSyncLookup(resolved);

    withManagedYaml(
      doc,
      () => {
        bumpCatalogToLatest(/^@platforma-sdk\//);
        pinCatalogTo("@platforma-sdk/lock", "1.42.3");
      },
      { getLatestVersion },
    );

    const cat = (doc.toJSON() as { catalog: Record<string, string> }).catalog;
    expect(cat["@platforma-sdk/model"]).toBe("9.9.9");
    expect(cat["@platforma-sdk/lock"]).toBe("1.42.3");
  });

  test("idempotent — second run produces the same YAML", () => {
    const doc = parseYaml("catalog:\n  '@platforma-sdk/some': 1.0.0\n");
    withManagedYaml(doc, () => pinCatalogTo("@platforma-sdk/some", "1.42.3"));
    const once = stringifyYaml(doc);
    withManagedYaml(doc, () => pinCatalogTo("@platforma-sdk/some", "1.42.3"));
    const twice = stringifyYaml(doc);
    expect(twice).toBe(once);
  });
});
