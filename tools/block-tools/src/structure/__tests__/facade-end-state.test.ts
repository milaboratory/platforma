// Facade end-state coverage — the slim `block/` the structurer emits and
// enforces: block-scope detection by the top-level `block` field, the four-file
// `src/` surface + facade `tsconfig.json`, the slim publishable `package.json`,
// sibling privacy, and legacy-shim cleanup.

import { describe, test, expect } from "vitest";
import type { BlockVars, RunContext } from "../engine/api";
import { classifyOne, type WorkspacePackage } from "../engine/discovery";
import { STRUCTURE } from "../structure-definition";
import { run as engineRun } from "../engine/runner";
import { defaultTemplateProvider, simulateInit } from "../engine/testing";

const TEMPLATES = defaultTemplateProvider();

const VARS: BlockVars = {
  facadeName: "@platforma-open/test-org.demo",
  baseName: "test-org.demo",
  npmOrg: "@platforma-open",
  orgScope: "test-org",
  shortName: "demo",
};

function pkg(path: string, pkgJson: Record<string, unknown>): WorkspacePackage {
  return { path, pkg: pkgJson };
}

describe("facade: block-scope detection by the top-level `block` field", () => {
  test("a package with a top-level `block` field is classified `block`", () => {
    expect(classifyOne(pkg("block", { name: "x", block: { components: {} } }))).toBe("block");
  });

  test("the `block` field wins over the model shape (the collision the order guards)", () => {
    // A migrated facade carries `@platforma-sdk/model` (devDep) + `main`, which
    // matches the model rule — the `block` field must take precedence.
    expect(
      classifyOne(
        pkg("block", {
          name: "x",
          main: "./dist/index.js",
          devDependencies: { "@platforma-sdk/model": "catalog:" },
          block: { components: {} },
        }),
      ),
    ).toBe("block");
  });

  test("a model-shaped package WITHOUT a `block` field is still `model`, not `block`", () => {
    expect(
      classifyOne(
        pkg("model", {
          name: "x.model",
          main: "dist/index.cjs",
          dependencies: { "@platforma-sdk/model": "catalog:" },
        }),
      ),
    ).toBe("model");
  });
});

describe("facade: four-file source surface + tsconfig", () => {
  test("init emits the 4 src files + tsconfig, and no legacy shim", () => {
    const { fs } = simulateInit({ vars: VARS });
    for (const f of [
      "block/src/index.ts",
      "block/src/AGENTS.ts",
      "block/src/block-extra.ts",
      "block/src/agents-extra.ts",
      "block/tsconfig.json",
    ]) {
      expect(fs.exists(f), `expected ${f} to be emitted`).toBe(true);
    }
    expect(fs.exists("block/index.js")).toBe(false);
    expect(fs.exists("block/index.d.ts")).toBe(false);
  });

  test("index.ts carries the per-block model import path and PascalName aliases", () => {
    const { fs } = simulateInit({ vars: VARS });
    const index = fs.read("block/src/index.ts");
    expect(index).toContain('import { platforma } from "@platforma-open/test-org.demo.model"');
    expect(index).toContain("export type DemoBlockContract = BlockContract;");
    expect(index).toContain("export const DemoBlockPointer = BlockPointer;");
    expect(index).toContain('export * from "./block-extra"');
  });

  test("tsconfig extends the facade preset (singular `block/facade`)", () => {
    const { fs } = simulateInit({ vars: VARS });
    const tsconfig = JSON.parse(fs.read("block/tsconfig.json"));
    expect(tsconfig.extends).toBe("@milaboratories/ts-configs/block/facade");
  });
});

describe("facade: slim `package.json` end-state", () => {
  test("is slim and carries the facade fields, scripts, and sibling devDeps", () => {
    const { fs } = simulateInit({ vars: VARS });
    const p = JSON.parse(fs.read("block/package.json"));

    // Slim invariant: zero runtime dependencies.
    expect(p.dependencies).toEqual({});

    expect(p.type).toBe("module");
    expect(p.files).toEqual(["dist", "block-pack"]);
    expect(p.main).toBe("./dist/index.js");
    expect(p.module).toBe("./dist/index.js");
    expect(p.types).toBe("./dist/index.d.ts");
    expect(p.exports).toEqual({
      ".": {
        sources: "./src/index.ts",
        types: "./dist/index.d.ts",
        default: "./dist/index.js",
      },
    });

    expect(Object.keys(p.scripts).sort()).toEqual(["build", "check", "do-pack", "prepublishOnly"]);
    expect(p.scripts.build).toBe("ts-builder build --target block-facade && block-tools pack");
    expect(p.scripts.check).toBe("ts-builder type-check --target block-facade");

    // Siblings are build-time devDeps (workspace links), never runtime deps.
    expect(p.devDependencies["@platforma-open/test-org.demo.model"]).toBe("workspace:*");
    expect(p.devDependencies["@platforma-open/test-org.demo.ui"]).toBe("workspace:*");
    expect(p.devDependencies["@platforma-open/test-org.demo.workflow"]).toBe("workspace:*");

    // Author-owned seed + engine-managed components both present.
    expect(p.block.components).toBeTruthy();
    expect(p.block.meta).toBeTruthy();
  });
});

describe("facade: `prepublishOnly` publish target branches on isSdkInternal", () => {
  const AUX_DEV =
    "block-tools publish -r s3://milab-euce1-prod-pkgs-s3-block-registry/aux/dev/?region=eu-central-1 --registry-serve-url https://aux-blocks.pl-open.science";

  test("in-SDK blocks publish to the aux/dev registry, regardless of org", () => {
    // `@milaboratories` would route to production via ORG_PUBLISH_TARGETS — the
    // isSdkInternal branch must override that and send it to aux/dev.
    const vars: BlockVars = {
      facadeName: "@milaboratories/test-org.demo",
      baseName: "test-org.demo",
      npmOrg: "@milaboratories",
      orgScope: "test-org",
      shortName: "demo",
    };
    const { fs } = simulateInit({ vars, isSdkInternal: true });
    const p = JSON.parse(fs.read("block/package.json"));
    expect(p.scripts.prepublishOnly).toBe(AUX_DEV);
  });

  test("standalone blocks publish to their per-org production target", () => {
    const open = simulateInit({ vars: VARS });
    expect(JSON.parse(open.fs.read("block/package.json")).scripts.prepublishOnly).toBe(
      "block-tools publish -r s3://milab-euce1-prod-pkgs-s3-block-registry/pub/releases/?region=eu-central-1 --registry-serve-url https://blocks.pl-open.science",
    );

    const milab = simulateInit({
      vars: {
        facadeName: "@milaboratories/test-org.demo",
        baseName: "test-org.demo",
        npmOrg: "@milaboratories",
        orgScope: "test-org",
        shortName: "demo",
      },
    });
    expect(JSON.parse(milab.fs.read("block/package.json")).scripts.prepublishOnly).toBe(
      "block-tools publish -r s3://milab-euce1-prod-pkgs-s3-block-registry/pub/releases/?region=eu-central-1 --registry-serve-url https://block.registry.platforma.bio/releases",
    );
  });
});

describe("facade: sibling package privacy", () => {
  test("model / ui / workflow / test are `private` with no `version`", () => {
    const { fs } = simulateInit({ vars: VARS });
    for (const scope of ["model", "ui", "workflow", "test"]) {
      const p = JSON.parse(fs.read(`${scope}/package.json`));
      expect(p.private, `${scope} must be private`).toBe(true);
      expect("version" in p, `${scope} must not carry a version`).toBe(false);
    }
  });
});

describe("facade: legacy shim cleanup on refresh", () => {
  test("a refresh removes a pre-existing block/index.js + index.d.ts, then is idempotent", () => {
    const { fs, ctx } = simulateInit({ vars: VARS });
    // Inject the legacy boilerplate shim a pre-facade block would carry.
    fs.write("block/index.js", "module.exports = { blockSpec: {} };\n");
    fs.write("block/index.d.ts", "export declare const blockSpec: unknown;\n");

    // Default-mode refresh (not dry-run): the engine's post-run recheck throws
    // RecheckError if a second pass would change anything — so this asserts
    // convergence too.
    const refreshCtx: RunContext = { ...ctx, dryRun: false };
    expect(() => engineRun(STRUCTURE, fs, refreshCtx, { templates: TEMPLATES })).not.toThrow();

    expect(fs.exists("block/index.js")).toBe(false);
    expect(fs.exists("block/index.d.ts")).toBe(false);
  });
});
