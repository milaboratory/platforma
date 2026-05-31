import { describe, test, expect } from "vitest";
import { bumpCatalogToLatest, withManagedYaml } from "../../content-rules";
import { parseYaml, stringifyYaml } from "../../parsers/yaml";
import {
  createMockRegistryClient,
  makeSyncLookup,
  prefetchLatestVersions,
} from "../../registry-client";

describe("bumpCatalogToLatest (mocked registry)", () => {
  test("bumps every entry matching the pattern, leaves non-matches alone", async () => {
    const doc = parseYaml(
      [
        "catalog:",
        "  '@platforma-sdk/model': 1.0.0",
        "  '@platforma-sdk/ui-vue': 1.0.0",
        "  '@milaboratories/ts-builder': 1.0.0",
        "  unrelated: 9.9.9",
      ].join("\n") + "\n",
    );

    const client = createMockRegistryClient({
      "@platforma-sdk/model": "2.0.0",
      "@platforma-sdk/ui-vue": "2.5.0",
      "@milaboratories/ts-builder": "0.4.0",
    });
    const resolved = await prefetchLatestVersions(client, [
      "@platforma-sdk/model",
      "@platforma-sdk/ui-vue",
      "@milaboratories/ts-builder",
    ]);
    const getLatestVersion = makeSyncLookup(resolved);

    withManagedYaml(
      doc,
      () => {
        bumpCatalogToLatest(/^@platforma-sdk\//);
        bumpCatalogToLatest(/^@milaboratories\//);
      },
      { getLatestVersion },
    );

    const cat = (doc.toJSON() as { catalog: Record<string, string> }).catalog;
    expect(cat["@platforma-sdk/model"]).toBe("2.0.0");
    expect(cat["@platforma-sdk/ui-vue"]).toBe("2.5.0");
    expect(cat["@milaboratories/ts-builder"]).toBe("0.4.0");
    expect(cat.unrelated).toBe("9.9.9");
  });

  test("no-op when getLatestVersion is not provided", () => {
    const doc = parseYaml("catalog:\n  '@platforma-sdk/model': 1.0.0\n");
    withManagedYaml(doc, () => bumpCatalogToLatest(/^@platforma-sdk\//));
    const cat = (doc.toJSON() as { catalog: Record<string, string> }).catalog;
    expect(cat["@platforma-sdk/model"]).toBe("1.0.0");
  });

  test("no-op when the catalog is missing entirely", () => {
    const doc = parseYaml("packages: []\n");
    withManagedYaml(doc, () => bumpCatalogToLatest(/.*/), {
      getLatestVersion: () => "1.0.0",
    });
    expect((doc.toJSON() as { packages: string[] }).packages).toEqual([]);
  });

  test("idempotent — second run produces the same YAML", async () => {
    const doc = parseYaml("catalog:\n  '@platforma-sdk/model': 1.0.0\n");
    const client = createMockRegistryClient({ "@platforma-sdk/model": "2.0.0" });
    const resolved = await prefetchLatestVersions(client, ["@platforma-sdk/model"]);
    const getLatestVersion = makeSyncLookup(resolved);

    withManagedYaml(doc, () => bumpCatalogToLatest(/^@platforma-sdk\//), {
      getLatestVersion,
    });
    const once = stringifyYaml(doc);
    withManagedYaml(doc, () => bumpCatalogToLatest(/^@platforma-sdk\//), {
      getLatestVersion,
    });
    const twice = stringifyYaml(doc);
    expect(twice).toBe(once);
  });

  test("does not hit network — mock client throws on unconfigured names", async () => {
    const client = createMockRegistryClient({});
    await expect(client.getLatestVersion("anything")).rejects.toThrow(/no version configured/);
  });

  test("default modifier writes the exact resolved version (no operator)", () => {
    const doc = parseYaml("catalog:\n  '@platforma-sdk/model': 1.0.0\n");
    withManagedYaml(doc, () => bumpCatalogToLatest(/^@platforma-sdk\//), {
      getLatestVersion: () => "2.3.4",
    });
    const cat = (doc.toJSON() as { catalog: Record<string, string> }).catalog;
    expect(cat["@platforma-sdk/model"]).toBe("2.3.4");
  });

  test("caret modifier prepends ^ to the resolved version", () => {
    const doc = parseYaml("catalog:\n  '@platforma-sdk/model': 1.0.0\n");
    withManagedYaml(doc, () => bumpCatalogToLatest(/^@platforma-sdk\//, "^"), {
      getLatestVersion: () => "2.3.4",
    });
    const cat = (doc.toJSON() as { catalog: Record<string, string> }).catalog;
    expect(cat["@platforma-sdk/model"]).toBe("^2.3.4");
  });

  test("tilde modifier prepends ~ to the resolved version", () => {
    const doc = parseYaml("catalog:\n  '@platforma-sdk/model': 1.0.0\n");
    withManagedYaml(doc, () => bumpCatalogToLatest(/^@platforma-sdk\//, "~"), {
      getLatestVersion: () => "2.3.4",
    });
    const cat = (doc.toJSON() as { catalog: Record<string, string> }).catalog;
    expect(cat["@platforma-sdk/model"]).toBe("~2.3.4");
  });

  test("idempotent with a modifier — second run produces the same YAML", () => {
    const doc = parseYaml("catalog:\n  '@platforma-sdk/model': 1.0.0\n");
    const getLatestVersion = () => "2.3.4";
    withManagedYaml(doc, () => bumpCatalogToLatest(/^@platforma-sdk\//, "^"), { getLatestVersion });
    const once = stringifyYaml(doc);
    withManagedYaml(doc, () => bumpCatalogToLatest(/^@platforma-sdk\//, "^"), { getLatestVersion });
    const twice = stringifyYaml(doc);
    expect(twice).toBe(once);
    expect(
      (doc.toJSON() as { catalog: Record<string, string> }).catalog["@platforma-sdk/model"],
    ).toBe("^2.3.4");
  });
});
