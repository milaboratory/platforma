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

/** The packages `init` wires to the kind: the model depends on it, the facade
 *  carries it as a devDependency. */
const KIND_DEPENDENTS = ["model/package.json", "block/package.json"];

type DepSections = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

const DEP_SECTIONS = ["dependencies", "devDependencies", "peerDependencies"] as const;

/** Every `<facade>.kind` reference the file declares, in any dep section. */
function kindDepsOf(fs: MemoryFileSystem, path: string): string[] {
  const pkg = JSON.parse(fs.read(path)) as DepSections;
  return DEP_SECTIONS.flatMap((s) => Object.keys(pkg[s] ?? {})).filter((d) => d.endsWith(".kind"));
}

/** Drop every `<facade>.kind` reference from one package.json. */
function stripKindDeps(fs: MemoryFileSystem, path: string): void {
  const pkg = JSON.parse(fs.read(path)) as DepSections;
  for (const section of DEP_SECTIONS) {
    const deps = pkg[section];
    if (!deps) continue;
    for (const name of Object.keys(deps)) if (name.endsWith(".kind")) delete deps[name];
  }
  fs.write(path, `${JSON.stringify(pkg, null, 2)}\n`);
}

/** A canonical block with every trace of its kind stripped back off — the shape
 *  a pre-kind block has on disk. The package, the workspace entry AND the
 *  dependencies its siblings declare on it all have to go: leaving the deps
 *  behind would make the wiring assertions below pass without a bootstrap. */
function preKindBlock(): MemoryFileSystem {
  const { fs } = simulateInit({ vars: VARS });
  for (const p of Object.keys(fs.snapshot())) {
    if (p === "kind" || p.startsWith("kind/")) fs.delete(p);
  }
  const ws = parseYaml(fs.read("pnpm-workspace.yaml")) as { packages: string[] };
  ws.packages = ws.packages.filter((p) => p !== "kind");
  fs.write("pnpm-workspace.yaml", `packages:\n${ws.packages.map((p) => `  - ${p}\n`).join("")}`);
  for (const p of KIND_DEPENDENTS) stripKindDeps(fs, p);
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

  test("the bootstrapped kind joins the workspace and its dependents", () => {
    const fs = preKindBlock();

    // The fixture really is kind-free: nothing declares the dep yet, so the
    // assertions after the refresh can only pass by way of the bootstrap.
    for (const p of KIND_DEPENDENTS) expect(kindDepsOf(fs, p)).toEqual([]);

    refresh(fs);

    const ws = parseYaml(fs.read("pnpm-workspace.yaml")) as { packages: string[] };
    expect(ws.packages).toContain("kind");

    for (const p of KIND_DEPENDENTS) {
      expect(kindDepsOf(fs, p)).toEqual(["@platforma-open/test-org.demo.kind"]);
    }
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
