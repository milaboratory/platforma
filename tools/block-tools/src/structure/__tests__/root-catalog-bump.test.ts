// Step-5a DoD: the `onUpdateDeps` frame in `rootCatalogBumpRules` must
// fire ONLY under `--update-deps-only`, and normal-mode leaves must be
// the inverse. Mocked registry — no network.

import { describe, test, expect } from "vitest";
import { parse as parseYaml } from "yaml";
import { defineStructure, scope, fixed, text } from "../engine/api";
import { rootCatalogBumpRules } from "../rules/root-catalog-bump";
import { run as engineRun } from "../engine/runner";
import { MemoryFileSystem } from "../engine/fs/memory";
import { createRunContext } from "../engine/ctx";
import type { BlockVars } from "../engine/api";

const VARS: BlockVars = {
  facadeName: "@platforma-open/test-org.demo",
  baseName: "test-org.demo",
  npmOrg: "@platforma-open",
  orgScope: "test-org",
  shortName: "demo",
};

// A normal-mode leaf (MARKER.txt) sits alongside the update-deps frame so
// we can prove the two modes are mutually exclusive.
const STRUCTURE = defineStructure(() => {
  scope("root", () => {
    fixed("MARKER.txt", text("marker\n"));
  });
  rootCatalogBumpRules();
});

const WORKSPACE_YAML = [
  "packages:",
  "  - .",
  "catalog:",
  "  '@platforma-sdk/model': 1.0.0",
  "  '@milaboratories/ts-builder': 1.0.0",
  "  lodash: 1.0.0",
  "",
].join("\n");

function freshFs(): MemoryFileSystem {
  return new MemoryFileSystem({ "pnpm-workspace.yaml": WORKSPACE_YAML });
}

function ctx(updateDepsOnly: boolean) {
  return createRunContext({
    blockVars: VARS,
    modules: [{ scope: "root", name: VARS.facadeName, path: "" }],
    isSdkInternal: false,
    updateDepsOnly,
    version: 1,
    dryRun: false,
  });
}

const MOCK_LATEST: Record<string, string> = {
  "@platforma-sdk/model": "9.9.9",
  "@milaboratories/ts-builder": "9.9.9",
};
const mockLookup = (name: string): string | undefined => MOCK_LATEST[name];

describe("rootCatalogBumpRules mode split", () => {
  test("default refresh: catalog untouched, normal-mode leaf fires", async () => {
    const fs = freshFs();
    await engineRun(STRUCTURE, fs, ctx(false), { registryLookup: mockLookup });

    const cat = (
      parseYaml(await fs.read("pnpm-workspace.yaml")) as { catalog: Record<string, string> }
    ).catalog;
    expect(cat["@platforma-sdk/model"]).toBe("1.0.0");
    expect(cat["@milaboratories/ts-builder"]).toBe("1.0.0");
    // Normal-mode leaf did fire.
    expect(await fs.exists("MARKER.txt")).toBe(true);
  });

  test("--update-deps-only: SDK catalog bumped, normal-mode leaf skipped", async () => {
    const fs = freshFs();
    await engineRun(STRUCTURE, fs, ctx(true), { registryLookup: mockLookup });

    const cat = (
      parseYaml(await fs.read("pnpm-workspace.yaml")) as { catalog: Record<string, string> }
    ).catalog;
    expect(cat["@platforma-sdk/model"]).toBe("9.9.9");
    expect(cat["@milaboratories/ts-builder"]).toBe("9.9.9");
    // Non-matching dep left alone.
    expect(cat["lodash"]).toBe("1.0.0");
    // Normal-mode leaf was skipped in update-deps-only mode.
    expect(await fs.exists("MARKER.txt")).toBe(false);
  });
});
