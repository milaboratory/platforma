import { describe, test, expect } from "vitest";
import { ensureCatalogPin, ensureCatalogVersion, withManagedYaml } from "../../content-rules";
import { parseYaml, stringifyYaml } from "../../parsers/yaml";

describe("ensureCatalogPin / ensureCatalogVersion", () => {
  test("ensureCatalogPin strips ^ from an existing catalog entry", () => {
    const doc = parseYaml("catalog:\n  yaml: ^2.5.0\n");
    withManagedYaml(doc, () => ensureCatalogPin("yaml"));
    expect((doc.toJSON() as { catalog: Record<string, string> }).catalog.yaml).toBe("2.5.0");
  });

  test("ensureCatalogPin strips ~ as well", () => {
    const doc = parseYaml("catalog:\n  yaml: ~2.5.0\n");
    withManagedYaml(doc, () => ensureCatalogPin("yaml"));
    expect((doc.toJSON() as { catalog: Record<string, string> }).catalog.yaml).toBe("2.5.0");
  });

  test("ensureCatalogPin is a no-op when the entry is missing", () => {
    const doc = parseYaml("catalog:\n  other: 1.0.0\n");
    withManagedYaml(doc, () => ensureCatalogPin("missing"));
    expect((doc.toJSON() as { catalog: Record<string, string> }).catalog.other).toBe("1.0.0");
  });

  test("ensureCatalogVersion sets a specific version", () => {
    const doc = parseYaml("catalog:\n  yaml: 2.5.0\n");
    withManagedYaml(doc, () => ensureCatalogVersion("yaml", "2.6.0"));
    expect((doc.toJSON() as { catalog: Record<string, string> }).catalog.yaml).toBe("2.6.0");
  });

  test("ensureCatalogVersion creates the entry if missing", () => {
    const doc = parseYaml("catalog: {}\n");
    withManagedYaml(doc, () => ensureCatalogVersion("yaml", "2.5.0"));
    expect((doc.toJSON() as { catalog: Record<string, string> }).catalog.yaml).toBe("2.5.0");
  });

  test("idempotent — pin + version double-run produces deep-equal output", () => {
    const doc = parseYaml("catalog:\n  a: ^1.0.0\n  b: 2.0.0\n");
    withManagedYaml(doc, () => {
      ensureCatalogPin("a");
      ensureCatalogVersion("b", "2.1.0");
    });
    const once = stringifyYaml(doc);
    withManagedYaml(doc, () => {
      ensureCatalogPin("a");
      ensureCatalogVersion("b", "2.1.0");
    });
    const twice = stringifyYaml(doc);
    expect(twice).toBe(once);
  });
});
