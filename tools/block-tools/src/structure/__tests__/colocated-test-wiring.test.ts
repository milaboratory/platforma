// End-to-end (real STRUCTURE): co-located unit tests wire the vitest `test`
// script + node ambient types into a scope, and ONLY that scope. A
// test-less scope stays lean (no test script, no @types/node, no node types
// in tsconfig) and a refresh of a test-less block is a fixpoint.

import { describe, test, expect } from "vitest";
import { parse as parseYaml } from "yaml";
import { simulateInit, defaultTemplateProvider } from "../engine/testing";
import { run as engineRun } from "../engine/runner";
import { discoverRunContext } from "../engine/discovery-fs";
import { STRUCTURE } from "../structure-definition";
import { SDK_CATALOG_PACKAGES } from "../rules/root-pnpm-workspace";
import type { BlockVars } from "../engine/api";

const VARS: BlockVars = {
  facadeName: "@platforma-open/test-org.demo",
  baseName: "test-org.demo",
  npmOrg: "@platforma-open",
  orgScope: "test-org",
  shortName: "demo",
};

const mockLookup = (name: string): string | undefined =>
  SDK_CATALOG_PACKAGES.includes(name) ? "9.9.9" : undefined;

type Pkg = {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};
type Tsconfig = { compilerOptions?: { types?: unknown } };

async function refresh(fs: Awaited<ReturnType<typeof simulateInit>>["fs"]) {
  const ctx = await discoverRunContext({ fs, isSdkInternal: false });
  await engineRun(STRUCTURE, fs, ctx, {
    templates: defaultTemplateProvider(),
    rediscover: async () => discoverRunContext({ fs, isSdkInternal: false, dryRun: true }),
  });
}

describe("co-located test wiring (real STRUCTURE)", () => {
  test("a model test wires test script + @types/node devDep + node types; ui (no test) stays lean", async () => {
    const { fs } = await simulateInit({ vars: VARS, registryLookup: mockLookup });
    // Author drops a co-located unit test into the model scope only.
    await fs.write(
      "model/src/label.test.ts",
      `import { test } from "vitest";\ntest("x", () => {});\n`,
    );

    await refresh(fs);

    const model = JSON.parse(await fs.read("model/package.json")) as Pkg;
    expect(model.scripts?.test).toBe("vitest run --passWithNoTests");
    expect(model.devDependencies?.["@types/node"]).toBe("*");
    // promoted from peer -> dev (single-section invariant drops the peer)
    expect(model.peerDependencies?.["@types/node"]).toBeUndefined();

    const modelTs = JSON.parse(await fs.read("model/tsconfig.json")) as Tsconfig;
    expect(modelTs.compilerOptions?.types).toEqual(["node"]);

    // ui has no co-located test -> stays lean.
    const ui = JSON.parse(await fs.read("ui/package.json")) as Pkg;
    expect(ui.scripts?.test).toBeUndefined();
    expect(ui.devDependencies?.["@types/node"]).toBeUndefined();
    const uiTs = JSON.parse(await fs.read("ui/tsconfig.json")) as Tsconfig;
    expect(uiTs.compilerOptions?.types).toBeUndefined();
  });

  test("test-less block: refresh is a fixpoint (no test script, no node types)", async () => {
    const { fs } = await simulateInit({ vars: VARS, registryLookup: mockLookup });

    const before = {
      model: await fs.read("model/package.json"),
      modelTs: await fs.read("model/tsconfig.json"),
      ui: await fs.read("ui/package.json"),
      uiTs: await fs.read("ui/tsconfig.json"),
      workflow: await fs.read("workflow/package.json"),
    };

    await refresh(fs);

    expect(await fs.read("model/package.json")).toBe(before.model);
    expect(await fs.read("model/tsconfig.json")).toBe(before.modelTs);
    expect(await fs.read("ui/package.json")).toBe(before.ui);
    expect(await fs.read("ui/tsconfig.json")).toBe(before.uiTs);
    expect(await fs.read("workflow/package.json")).toBe(before.workflow);

    // none of the test-less scopes carry a `test` script
    const model = JSON.parse(before.model) as Pkg;
    const ui = JSON.parse(before.ui) as Pkg;
    const workflow = JSON.parse(before.workflow) as Pkg;
    expect(model.scripts?.test).toBeUndefined();
    expect(ui.scripts?.test).toBeUndefined();
    expect(workflow.scripts?.test).toBeUndefined();
  });

  test("a workflow test wires its test script (no node-types wiring needed there)", async () => {
    const { fs } = await simulateInit({ vars: VARS, registryLookup: mockLookup });
    await fs.write(
      "workflow/src/wf.test.ts",
      `import { test } from "vitest";\ntest("x", () => {});\n`,
    );

    await refresh(fs);

    const workflow = JSON.parse(await fs.read("workflow/package.json")) as Pkg;
    expect(workflow.scripts?.test).toBe("vitest run --passWithNoTests");
    // workflow tsconfig stays standalone — no node types added there
    const wfTs = parseYaml(await fs.read("workflow/tsconfig.json")) as { types?: unknown };
    // (workflow tsconfig is JSON, but parseYaml reads JSON too; types:[] unchanged)
    expect(wfTs.types).toEqual([]);
  });
});
