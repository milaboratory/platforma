import { describe, test, expect } from "vitest";
import { ensureCatalogAbsent, withManagedYaml } from "../../content-rules";
import { parseYaml, stringifyYaml } from "../../parsers/yaml";

describe("ensureCatalogAbsent", () => {
  test("removes a present entry, leaves other keys alone", () => {
    const doc = parseYaml("catalog:\n  drop-me: 1.0.0\n  keep: 2.0.0\n");
    withManagedYaml(doc, () => ensureCatalogAbsent("drop-me"));
    const cat = (doc.toJSON() as { catalog: Record<string, string> }).catalog;
    expect(cat["drop-me"]).toBeUndefined();
    expect(cat.keep).toBe("2.0.0");
  });

  test("no-op when the key is absent", () => {
    const doc = parseYaml("catalog:\n  keep: 2.0.0\n");
    withManagedYaml(doc, () => ensureCatalogAbsent("never-here"));
    const cat = (doc.toJSON() as { catalog: Record<string, string> }).catalog;
    expect(cat.keep).toBe("2.0.0");
  });

  test("idempotent — second run produces the same YAML", () => {
    const doc = parseYaml("catalog:\n  drop-me: 1.0.0\n  keep: 2.0.0\n");
    withManagedYaml(doc, () => ensureCatalogAbsent("drop-me"));
    const once = stringifyYaml(doc);
    withManagedYaml(doc, () => ensureCatalogAbsent("drop-me"));
    const twice = stringifyYaml(doc);
    expect(twice).toBe(once);
  });
});
