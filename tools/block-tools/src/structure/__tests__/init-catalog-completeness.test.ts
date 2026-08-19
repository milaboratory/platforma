// One `"x": "catalog:"` with no `x` catalog key fails the whole `pnpm install`
// with ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC. The dep sets live in
// `rules/*-package-json.ts` and the catalog in `rules/root-pnpm-workspace.ts`;
// nothing else ties the two together.

import { describe, test, expect } from "vitest";
import { parse as parseYaml } from "yaml";
import { simulateInit } from "../engine/testing";
import { MemoryFileSystem } from "../engine/fs/memory";
import { SDK_CATALOG_PACKAGES, DERIVED_CATALOG_PINS } from "../rules/root-pnpm-workspace";
import type { BlockVars } from "../engine/api";

const DEP_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

const BASE_VARS: BlockVars = {
  facadeName: "@platforma-open/test-org.demo",
  baseName: "test-org.demo",
  npmOrg: "@platforma-open",
  orgScope: "test-org",
  shortName: "demo",
};

// Distinct mock versions, so a wrong-name lookup cannot pass by accident.
const registryLookup = (name: string): string | undefined =>
  SDK_CATALOG_PACKAGES.includes(name) ? "9.9.9" : undefined;
const derivedPinLookup = (entry: string): string | undefined =>
  DERIVED_CATALOG_PINS.some((pin) => pin.entry === entry) ? "8.8.8" : undefined;

/** `path → catalog-referencing dep names`, over every package.json written. */
function catalogReferences(fs: MemoryFileSystem): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const path of fs.list("")) {
    if (!path.endsWith("package.json")) continue;
    const manifest = JSON.parse(fs.read(path)) as Record<string, unknown>;
    const names: string[] = [];
    for (const section of DEP_SECTIONS) {
      const deps = manifest[section];
      if (typeof deps !== "object" || deps === null) continue;
      for (const [name, spec] of Object.entries(deps as Record<string, string>)) {
        if (spec === "catalog:") names.push(name);
      }
    }
    if (names.length > 0) out.set(path, names);
  }
  return out;
}

function catalogOf(fs: MemoryFileSystem): Record<string, string> {
  const parsed = parseYaml(fs.read("pnpm-workspace.yaml")) as {
    catalog?: Record<string, string>;
  };
  return parsed.catalog ?? {};
}

describe("init output is installable: every `catalog:` dep has a catalog entry", () => {
  for (const [shape, vars] of [
    ["without software", BASE_VARS],
    ["with software", { ...BASE_VARS, softwarePlatform: "python" }],
  ] as const) {
    test(`a block ${shape}`, () => {
      const { fs } = simulateInit({ vars, registryLookup, derivedPinLookup });
      const catalog = catalogOf(fs);
      const references = catalogReferences(fs);

      // Guard the guard: a walk that finds nothing would pass vacuously.
      expect(references.size).toBeGreaterThan(0);

      for (const [path, names] of references) {
        for (const name of names) {
          expect(
            catalog[name],
            `${path} declares "${name}": "catalog:", but pnpm-workspace.yaml has no ` +
              `'${name}' catalog entry — pnpm install fails with ` +
              `ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC. Add it to ` +
              `SDK_CATALOG_PACKAGES or INFRA_CATALOG_FLOOR in rules/root-pnpm-workspace.ts.`,
          ).toBeDefined();
        }
      }
    });
  }
});
