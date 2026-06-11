// YAML parser primitives — round trip preserves comments around a
// catalog block (the load-bearing case for `pnpm-workspace.yaml`).
// Verifies get/set/has via jsonPath and that mutating one value leaves
// surrounding comments intact.

import { describe, test, expect } from "vitest";
import { parseYaml, stringifyYaml, yamlGet, yamlHas, yamlSet, yamlDelete } from "../parsers/yaml";

const CATALOG_YAML = `# pnpm workspace
packages:
  - .
  - block
  - model

# Pinned SDK versions — bump via block-tools structure refresh --update-deps-only.
catalog:
  # SDK packages — keep alphabetical for diff friendliness.
  "@platforma-sdk/model": 1.2.3
  # Build tooling.
  "@milaboratories/ts-builder": 0.5.0
`;

describe("YAML parser — comment-preserving round trip", () => {
  test("identity round trip preserves all comments", () => {
    const doc = parseYaml(CATALOG_YAML);
    const out = stringifyYaml(doc);
    expect(out).toContain("# pnpm workspace");
    expect(out).toContain("# Pinned SDK versions");
    expect(out).toContain("# SDK packages — keep alphabetical for diff friendliness.");
    expect(out).toContain("# Build tooling.");
  });

  test("mutating one catalog entry preserves surrounding comments", () => {
    const doc = parseYaml(CATALOG_YAML);
    yamlSet(doc, "catalog.@platforma-sdk/model", "9.9.9");
    const out = stringifyYaml(doc);
    expect(out).toContain('"@platforma-sdk/model": 9.9.9');
    expect(out).toContain("# Pinned SDK versions");
    expect(out).toContain("# SDK packages — keep alphabetical for diff friendliness.");
    expect(out).toContain("# Build tooling.");
  });

  test("yamlGet / yamlHas read scalar values", () => {
    const doc = parseYaml(CATALOG_YAML);
    // "1.2.3" is parsed as a plain string (not a YAML number).
    expect(yamlGet(doc, "catalog.@platforma-sdk/model")).toBe("1.2.3");
    expect(yamlHas(doc, "catalog.@platforma-sdk/model")).toBe(true);
    expect(yamlHas(doc, "catalog.nope")).toBe(false);
  });

  test("yamlDelete removes a key; round trip drops it", () => {
    const doc = parseYaml(CATALOG_YAML);
    yamlDelete(doc, "catalog.@milaboratories/ts-builder");
    const out = stringifyYaml(doc);
    expect(out).not.toContain("@milaboratories/ts-builder");
    // Sibling entries untouched.
    expect(out).toContain("@platforma-sdk/model");
  });

  test("parse → stringify on minimal scalar map", () => {
    const doc = parseYaml("a: 1\nb: 2\n");
    expect(stringifyYaml(doc)).toBe("a: 1\nb: 2\n");
  });

  test("yamlGet with empty jsonPath returns the whole document as JS", () => {
    const doc = parseYaml("a: 1\n");
    expect(yamlGet(doc, "")).toEqual({ a: 1 });
  });

  test("yamlHas with empty jsonPath returns true", () => {
    const doc = parseYaml("a: 1\n");
    expect(yamlHas(doc, "")).toBe(true);
  });

  test("yamlSet with empty jsonPath throws", () => {
    const doc = parseYaml("a: 1\n");
    expect(() => yamlSet(doc, "", "x")).toThrow(/jsonPath must be non-empty/);
  });

  test("yamlDelete with empty jsonPath throws", () => {
    const doc = parseYaml("a: 1\n");
    expect(() => yamlDelete(doc, "")).toThrow(/jsonPath must be non-empty/);
  });

  test("yamlSet auto-creates intermediate maps", () => {
    const doc = parseYaml("a: 1\n");
    yamlSet(doc, "nested.key", "v");
    expect(yamlGet(doc, "nested.key")).toBe("v");
  });
});
