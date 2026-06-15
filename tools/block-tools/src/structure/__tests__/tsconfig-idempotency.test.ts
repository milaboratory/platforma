// Regression: a test-bearing model/ui scope migrating from a LEGACY tsconfig
// must converge in a single pass.
//
// History: the tsconfig used to be a `managed` file whose body did
// `removeField("compilerOptions")`, conditionally re-added
// `compilerOptions.types: ["node"]`, then `ensureField("include", …)`. On a
// legacy tsconfig with no `include`, pass 1 appended `include` AFTER the
// re-added `compilerOptions` → `{extends, compilerOptions, include}`, while the
// body's fixpoint was `{extends, include, compilerOptions}`. The two differed
// only in key order, so the engine's post-run recheck saw a phantom diff and
// `refresh` aborted with a non-idempotency RecheckError on EVERY test-bearing
// block migrating off a legacy (vite-era) tsconfig.
//
// Now the tsconfig is a `fixed` file with two static end states selected by a
// `when`/else on co-located-test presence (`tsconfig.node.json` vs
// `tsconfig.json`). There is no imperative body and no insertion-order side
// effect, so single-pass idempotency holds by construction. This test guards
// that property.

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

const mockLookup = (name: string): string | undefined =>
  SDK_CATALOG_PACKAGES.includes(name) ? "9.9.9" : undefined;

// `refresh` runs the full engine INCLUDING the post-run recheck (via
// `rediscover`); a non-idempotent rule set makes this throw.
function refresh(fs: ReturnType<typeof simulateInit>["fs"]) {
  const ctx = discoverRunContext({ fs, isSdkInternal: false });
  engineRun(STRUCTURE, fs, ctx, {
    templates: defaultTemplateProvider(),
    rediscover: () => discoverRunContext({ fs, isSdkInternal: false, dryRun: true }),
  });
}

const CANONICAL_ORDER = ["extends", "compilerOptions", "include"];

describe("tsconfig first-pass idempotency on legacy (no-include) tsconfig", () => {
  test("model + ui co-located tests, legacy tsconfig without `include` → refresh converges in one pass", () => {
    const { fs } = simulateInit({ vars: VARS, registryLookup: mockLookup });

    // Co-located unit tests in both scopes -> the conditional node-types re-add fires.
    fs.write("model/src/m.test.ts", `import { test } from "vitest";\ntest("x", () => {});\n`);
    fs.write("ui/src/u.test.ts", `import { test } from "vitest";\ntest("x", () => {});\n`);

    // Legacy tsconfigs as a vite-era block carried them: a `compilerOptions`
    // block and NO top-level `include`. This is what made pass 1 append
    // `include` after the re-added `compilerOptions`.
    fs.write(
      "model/tsconfig.json",
      JSON.stringify({
        extends: "@milaboratories/ts-configs/block/model",
        compilerOptions: { strict: true },
      }),
    );
    fs.write(
      "ui/tsconfig.json",
      JSON.stringify({
        extends: "@milaboratories/ts-configs/block/ui",
        compilerOptions: { strict: true },
      }),
    );

    // Without the fix this throws RecheckError (rule set not idempotent).
    expect(() => refresh(fs)).not.toThrow();

    for (const scope of ["model", "ui"]) {
      const ts = JSON.parse(fs.read(`${scope}/tsconfig.json`)) as {
        extends: string;
        include: string[];
        compilerOptions: { types: string[] };
      };
      // Canonical, deterministic key order.
      expect(Object.keys(ts)).toEqual(CANONICAL_ORDER);
      expect(ts.extends).toBe(`@milaboratories/ts-configs/block/${scope}`);
      expect(ts.include).toEqual(["src/**/*"]);
      // node types wired (co-located test present); legacy `strict` pruned.
      expect(ts.compilerOptions).toEqual({ types: ["node"] });
    }
  });
});
