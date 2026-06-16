import { describe, test, expect } from "vitest";
import { pinCatalogToDependencyOf, withManagedYaml } from "../../content-rules";
import { parseYaml, stringifyYaml } from "../../parsers/yaml";

// The builder is sync: it reads a value the runner pre-resolved + validated
// into `getDerivedDependencyPin`. These tests inject that accessor directly.
const lookup =
  (m: Record<string, string>) =>
  (entry: string): string | undefined =>
    m[entry];

describe("pinCatalogToDependencyOf (mocked derived-pin lookup)", () => {
  test("overwrites a present LOOSE entry with the derived exact version", () => {
    const doc = parseYaml("catalog:\n  vue: ^3.5.24\n");
    withManagedYaml(doc, () => pinCatalogToDependencyOf("vue", { of: "@platforma-sdk/ui-vue" }), {
      getDerivedDependencyPin: lookup({ vue: "3.5.24" }),
    });
    const cat = (doc.toJSON() as { catalog: Record<string, string> }).catalog;
    expect(cat.vue).toBe("3.5.24");
  });

  test("creates an absent entry", () => {
    const doc = parseYaml("catalog:\n  unrelated: 1.0.0\n");
    withManagedYaml(doc, () => pinCatalogToDependencyOf("vue", { of: "@platforma-sdk/ui-vue" }), {
      getDerivedDependencyPin: lookup({ vue: "3.5.24" }),
    });
    const cat = (doc.toJSON() as { catalog: Record<string, string> }).catalog;
    expect(cat.vue).toBe("3.5.24");
    expect(cat.unrelated).toBe("1.0.0");
  });

  test("no-op when no derived-pin lookup is provided (default refresh)", () => {
    const doc = parseYaml("catalog:\n  vue: ^3.5.24\n");
    withManagedYaml(doc, () => pinCatalogToDependencyOf("vue", { of: "@platforma-sdk/ui-vue" }));
    const cat = (doc.toJSON() as { catalog: Record<string, string> }).catalog;
    expect(cat.vue).toBe("^3.5.24");
  });

  test("no-op when the entry was not prefetched (lookup returns undefined)", () => {
    const doc = parseYaml("catalog:\n  vue: ^3.5.24\n");
    withManagedYaml(doc, () => pinCatalogToDependencyOf("vue", { of: "@platforma-sdk/ui-vue" }), {
      getDerivedDependencyPin: lookup({ other: "1.0.0" }),
    });
    const cat = (doc.toJSON() as { catalog: Record<string, string> }).catalog;
    expect(cat.vue).toBe("^3.5.24");
  });

  test("idempotent — second run produces the same YAML", () => {
    const doc = parseYaml("catalog:\n  vue: ^3.5.24\n");
    const opts = { getDerivedDependencyPin: lookup({ vue: "3.5.24" }) };
    withManagedYaml(
      doc,
      () => pinCatalogToDependencyOf("vue", { of: "@platforma-sdk/ui-vue" }),
      opts,
    );
    const once = stringifyYaml(doc);
    withManagedYaml(
      doc,
      () => pinCatalogToDependencyOf("vue", { of: "@platforma-sdk/ui-vue" }),
      opts,
    );
    const twice = stringifyYaml(doc);
    expect(twice).toBe(once);
  });
});
