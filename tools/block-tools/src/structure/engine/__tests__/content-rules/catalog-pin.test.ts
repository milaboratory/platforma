import { describe, test, expect } from "vitest";
import { ensureCatalogVersion, pinCatalogTo, withManagedYaml } from "../../content-rules";
import { parseYaml, stringifyYaml } from "../../parsers/yaml";

describe("ensureCatalogVersion (add-if-absent) / pinCatalogTo (set-exact)", () => {
  test("ensureCatalogVersion leaves a present entry untouched (no-downgrade)", () => {
    const doc = parseYaml("catalog:\n  yaml: 2.5.0\n");
    // A version is already present — add-if-absent must NOT overwrite or
    // downgrade it.
    withManagedYaml(doc, () => ensureCatalogVersion("yaml", "2.6.0"));
    expect((doc.toJSON() as { catalog: Record<string, string> }).catalog.yaml).toBe("2.5.0");
  });

  test("ensureCatalogVersion creates the entry if missing", () => {
    const doc = parseYaml("catalog: {}\n");
    withManagedYaml(doc, () => ensureCatalogVersion("yaml", "2.5.0"));
    expect((doc.toJSON() as { catalog: Record<string, string> }).catalog.yaml).toBe("2.5.0");
  });

  test("pinCatalogTo overwrites a present entry (set-exact, downgrade-capable)", () => {
    const doc = parseYaml("catalog:\n  yaml: 2.5.0\n");
    withManagedYaml(doc, () => pinCatalogTo("yaml", "3.0.0"));
    expect((doc.toJSON() as { catalog: Record<string, string> }).catalog.yaml).toBe("3.0.0");
  });

  test("pinCatalogTo creates the entry if missing", () => {
    const doc = parseYaml("catalog: {}\n");
    withManagedYaml(doc, () => pinCatalogTo("yaml", "1.2.3"));
    expect((doc.toJSON() as { catalog: Record<string, string> }).catalog.yaml).toBe("1.2.3");
  });

  test("idempotent — double-run produces deep-equal output", () => {
    const doc = parseYaml("catalog:\n  a: 1.0.0\n  b: 2.0.0\n");
    withManagedYaml(doc, () => {
      ensureCatalogVersion("a", "1.5.0");
      ensureCatalogVersion("b", "2.1.0");
    });
    const once = stringifyYaml(doc);
    withManagedYaml(doc, () => {
      ensureCatalogVersion("a", "1.5.0");
      ensureCatalogVersion("b", "2.1.0");
    });
    const twice = stringifyYaml(doc);
    expect(twice).toBe(once);
  });
});
