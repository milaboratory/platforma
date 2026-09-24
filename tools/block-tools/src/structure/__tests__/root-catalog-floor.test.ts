// The curated infra floor must be seeded on EVERY refresh, not only on init /
// `--update-deps-only`. The root package.json rules hand out `catalog:`
// references for these entries (turbo, shx, cross-env, …) on every refresh, so
// seeding them only in the update-deps frame left a plain `structure refresh`
// writing a `catalog:` for a key the catalog did not carry — `pnpm install`
// then failed with ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC.

import { describe, test, expect } from "vitest";
import { parse as parseYaml } from "yaml";
import { defineStructure, scope, managed, generate } from "../engine/api";
import {
  rootPnpmWorkspaceInitial,
  rootPnpmWorkspaceRules,
  INFRA_CATALOG_FLOOR,
} from "../rules/root-pnpm-workspace";
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

const STRUCTURE = defineStructure(() => {
  scope("root", () => {
    managed(
      "pnpm-workspace.yaml",
      generate((ctx) => rootPnpmWorkspaceInitial(ctx)),
      () => {
        rootPnpmWorkspaceRules();
      },
    );
  });
});

// A migrated block: no infra floor keys at all, and one entry already pinned
// to a version of the author's choosing.
const WORKSPACE_YAML = [
  "packages:",
  "  - .",
  "catalog:",
  "  shx: 0.3.0",
  "  lodash: 1.0.0",
  "",
].join("\n");

function run(updateDepsOnly: boolean): Record<string, string> {
  const fs = new MemoryFileSystem({ "pnpm-workspace.yaml": WORKSPACE_YAML });
  engineRun(
    STRUCTURE,
    fs,
    createRunContext({
      blockVars: VARS,
      modules: [{ scope: "root", name: VARS.facadeName, path: "" }],
      isSdkInternal: false,
      updateDepsOnly,
      version: 1,
      dryRun: false,
    }),
    {},
  );
  return (parseYaml(fs.read("pnpm-workspace.yaml")) as { catalog: Record<string, string> }).catalog;
}

describe("infra catalog floor", () => {
  test("a DEFAULT refresh seeds every floor entry the block is missing", () => {
    const cat = run(false);
    for (const [name, version] of Object.entries(INFRA_CATALOG_FLOOR)) {
      if (name === "shx") continue; // already pinned by the author, asserted below
      expect(cat[name], `${name} must be seeded on a default refresh`).toBe(version);
    }
    // Every `catalog:` the root package.json rules emit must resolve.
    expect(cat["cross-env"]).toBe(INFRA_CATALOG_FLOOR["cross-env"]);
  });

  test("add-if-absent: a version the block already pins is never rewritten", () => {
    expect(run(false)["shx"]).toBe("0.3.0");
    expect(run(true)["shx"]).toBe("0.3.0");
    // An unrelated entry is left alone.
    expect(run(false)["lodash"]).toBe("1.0.0");
  });

  test("seeding is a fixpoint — a second refresh changes nothing", () => {
    const once = run(false);
    const fs = new MemoryFileSystem({ "pnpm-workspace.yaml": WORKSPACE_YAML });
    const context = () =>
      createRunContext({
        blockVars: VARS,
        modules: [{ scope: "root", name: VARS.facadeName, path: "" }],
        isSdkInternal: false,
        updateDepsOnly: false,
        version: 1,
        dryRun: false,
      });
    engineRun(STRUCTURE, fs, context(), {});
    const second = engineRun(STRUCTURE, fs, context(), {});
    expect(second.changes.length, "second refresh must make no changes").toBe(0);
    expect(
      (parseYaml(fs.read("pnpm-workspace.yaml")) as { catalog: Record<string, string> }).catalog,
    ).toEqual(once);
  });
});
