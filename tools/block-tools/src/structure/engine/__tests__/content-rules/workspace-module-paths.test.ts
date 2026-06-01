import { describe, test, expect } from "vitest";
import { ensureWorkspaceModulePaths, withManagedYaml } from "../../content-rules";
import { parseYaml, stringifyYaml } from "../../parsers/yaml";
import { createRunContext } from "../../ctx";
import type { Module, BlockVars } from "../../api";

const vars: BlockVars = {
  facadeName: "@platforma-open/demo.feature",
  baseName: "demo.feature",
  npmOrg: "@platforma-open",
  orgScope: "demo",
  shortName: "feature",
};

const modules: Module[] = [
  { scope: "root", name: "@platforma-open/demo.feature", path: "" },
  { scope: "block", name: "@platforma-open/demo.feature.block", path: "block" },
  { scope: "model", name: "@platforma-open/demo.feature.model", path: "model" },
  { scope: "ui", name: "@platforma-open/demo.feature.ui", path: "ui" },
  { scope: "workflow", name: "@platforma-open/demo.feature.workflow", path: "workflow" },
  { scope: "test", name: "@platforma-open/demo.feature.test", path: "test" },
];

const ctx = createRunContext({ blockVars: vars, modules });

describe("ensureWorkspaceModulePaths", () => {
  // The root module ("") is discovered implicitly and is NEVER written
  // to `packages:` — listing "." there would break turbo's task graph.
  const nonRootModules = modules.filter((m) => m.path !== "");

  test("writes a sorted packages list of non-root modules (root excluded)", () => {
    const doc = parseYaml("packages: []\n");
    withManagedYaml(doc, () => ensureWorkspaceModulePaths(), { ctx });
    const json = doc.toJSON() as { packages: string[] };
    expect(json.packages).toEqual(["block", "model", "test", "ui", "workflow"]);
  });

  test("creates packages list if missing", () => {
    const doc = parseYaml("# empty\n");
    withManagedYaml(doc, () => ensureWorkspaceModulePaths(), { ctx });
    const json = doc.toJSON() as { packages: string[] };
    expect(json.packages.length).toBe(nonRootModules.length);
  });

  test("idempotent — second run leaves the YAML output unchanged", () => {
    const doc = parseYaml("packages: []\n");
    withManagedYaml(doc, () => ensureWorkspaceModulePaths(), { ctx });
    const once = stringifyYaml(doc);
    withManagedYaml(doc, () => ensureWorkspaceModulePaths(), { ctx });
    const twice = stringifyYaml(doc);
    expect(twice).toBe(once);
  });
});
