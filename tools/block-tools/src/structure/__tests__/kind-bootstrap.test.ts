// A block written before kinds existed carries no `kind/` package, so
// DISCOVERY finds no kind module. `refresh` must BOOTSTRAP the package rather
// than fail: DISCOVERY synthesises the module (discovery-fs.ts) and the kind
// rules then write it. Before this, the facade rule threw
// `declares no kind` before a single file was touched, and the only way
// forward was to hand-craft `kind/package.json` so discovery could see it.

import { describe, test, expect } from "vitest";
import { parse as parseYaml } from "yaml";
import type { BlockVars } from "../engine/api";
import { simulateInit, defaultTemplateProvider } from "../engine/testing";
import { discoverRunContext } from "../engine/discovery-fs";
import { run as engineRun } from "../engine/runner";
import { STRUCTURE } from "../structure-definition";
import type { MemoryFileSystem } from "../engine/fs/memory";

const VARS: BlockVars = {
  facadeName: "@platforma-open/test-org.demo",
  baseName: "test-org.demo",
  npmOrg: "@platforma-open",
  orgScope: "test-org",
  shortName: "demo",
};

/** A canonical block with its `kind/` package stripped back off — the shape a
 *  pre-kind block has on disk. */
function preKindBlock(): MemoryFileSystem {
  const { fs } = simulateInit({ vars: VARS });
  for (const p of Object.keys(fs.snapshot())) {
    if (p === "kind" || p.startsWith("kind/")) fs.delete(p);
  }
  const ws = parseYaml(fs.read("pnpm-workspace.yaml")) as { packages: string[] };
  ws.packages = ws.packages.filter((p) => p !== "kind");
  fs.write("pnpm-workspace.yaml", `packages:\n${ws.packages.map((p) => `  - ${p}\n`).join("")}`);
  return fs;
}

function refresh(fs: MemoryFileSystem) {
  const ctx = discoverRunContext({ fs, isSdkInternal: false });
  return engineRun(STRUCTURE, fs, ctx, { templates: defaultTemplateProvider() });
}

describe("refresh bootstraps a missing kind package", () => {
  test("DISCOVERY synthesises the kind module", () => {
    const ctx = discoverRunContext({ fs: preKindBlock(), isSdkInternal: false });
    const kind = ctx.modules.filter((m) => m.scope === "kind");
    expect(kind).toHaveLength(1);
    expect(kind[0]).toMatchObject({
      name: "@platforma-open/test-org.demo.kind",
      path: "kind",
    });
  });

  test("refresh writes the package, its configs and the params sentinel", () => {
    const fs = preKindBlock();
    expect(fs.exists("kind/package.json")).toBe(false);

    refresh(fs);

    expect(fs.exists("kind/package.json")).toBe(true);
    expect(fs.exists("kind/tsconfig.json")).toBe(true);
    expect(fs.exists("kind/.oxlintrc.json")).toBe(true);
    expect(fs.exists("kind/.oxfmtrc.json")).toBe(true);

    const pkg = JSON.parse(fs.read("kind/package.json")) as {
      name: string;
      dependencies: Record<string, string>;
    };
    expect(pkg.name).toBe("@platforma-open/test-org.demo.kind");
    expect(pkg.dependencies).toHaveProperty("@platforma-sdk/block-kind");

    // The entry point is a `scaffold`, so it lands on refresh too — a `seed`
    // would have left the package without one.
    expect(fs.read("kind/src/index.ts")).toContain("NEEDS_BLOCK_PARAMS");
  });

  test("the bootstrapped kind joins the workspace and the model's deps", () => {
    const fs = preKindBlock();
    refresh(fs);

    const ws = parseYaml(fs.read("pnpm-workspace.yaml")) as { packages: string[] };
    expect(ws.packages).toContain("kind");

    const model = JSON.parse(fs.read("model/package.json")) as {
      dependencies?: Record<string, string>;
    };
    expect(model.dependencies).toHaveProperty("@platforma-open/test-org.demo.kind");
  });

  test("a second refresh is a fixpoint — the sentinel is never rewritten", () => {
    const fs = preKindBlock();
    refresh(fs);
    fs.write("kind/src/index.ts", "// the author's own contract\n");

    const changes = refresh(fs).changes;

    expect(changes).toHaveLength(0);
    expect(fs.read("kind/src/index.ts")).toBe("// the author's own contract\n");
  });
});
