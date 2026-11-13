// End-to-end (real STRUCTURE): the workflow `check` script drops the unused
// tengo imports before it checks the sources, an existing block converges on
// that script, and a second refresh changes nothing.
//
// `imports` belongs to `check` and not to `build`: the build task declares
// every tracked file as its input, so a command that rewrites sources inside
// it would change the inputs turbo has already hashed.

import { describe, test, expect } from "vitest";
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

const CHECK_SCRIPT = "pl-tengo imports && pl-tengo check";
const BUILD_SCRIPT = "shx rm -rf dist && pl-tengo build";

const mockLookup = (name: string): string | undefined =>
  SDK_CATALOG_PACKAGES.includes(name) ? "9.9.9" : undefined;

type Pkg = { scripts?: Record<string, string> };

function refresh(fs: ReturnType<typeof simulateInit>["fs"]) {
  const ctx = discoverRunContext({ fs, isSdkInternal: false });
  engineRun(STRUCTURE, fs, ctx, {
    templates: defaultTemplateProvider(),
    rediscover: () => discoverRunContext({ fs, isSdkInternal: false, dryRun: true }),
  });
}

const workflowScripts = (fs: ReturnType<typeof simulateInit>["fs"]): Record<string, string> =>
  (JSON.parse(fs.read("workflow/package.json")) as Pkg).scripts ?? {};

describe("workflow imports check (real STRUCTURE)", () => {
  test("init writes the check script, and leaves build without it", () => {
    const { fs } = simulateInit({ vars: VARS, registryLookup: mockLookup });

    const scripts = workflowScripts(fs);
    expect(scripts.check).toBe(CHECK_SCRIPT);
    expect(scripts.build).toBe(BUILD_SCRIPT);
  });

  test("a block with the old check script converges on the new one", () => {
    const { fs } = simulateInit({ vars: VARS, registryLookup: mockLookup });

    // A block made before the command existed.
    const pkg = JSON.parse(fs.read("workflow/package.json")) as Pkg;
    pkg.scripts = { ...pkg.scripts, check: "pl-tengo check" };
    fs.write("workflow/package.json", JSON.stringify(pkg, null, 2) + "\n");

    refresh(fs);

    expect(workflowScripts(fs).check).toBe(CHECK_SCRIPT);
  });

  test("refresh of a canonical block changes nothing", () => {
    const { fs } = simulateInit({ vars: VARS, registryLookup: mockLookup });
    const before = fs.read("workflow/package.json");

    refresh(fs);

    expect(fs.read("workflow/package.json")).toBe(before);
  });
});
