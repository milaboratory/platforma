// Layer-2: the version-model redesign end-to-end against the real
// STRUCTURE, mocked registry (no network).
//
// Proves the three promises of the `onInitOrUpdate` redesign:
//   1. init writes REAL latest SDK versions (the `onInitOrUpdate` frame
//      fires on init), while the infra floor stays `~`-pinned and untouched;
//   2. a default refresh touches NO catalog versions — the central
//      no-pin-on-refresh guard (byte-identical pnpm-workspace.yaml);
//   3. init = fixpoint of check: a dry-run after init reports no
//      pnpm-workspace.yaml change.

import { describe, test, expect } from "vitest";
import { parse as parseYaml } from "yaml";
import { simulateInit, defaultTemplateProvider } from "../engine/testing";
import { run as engineRun } from "../engine/runner";
import { discoverRunContext } from "../engine/discovery-fs";
import { STRUCTURE } from "../structure-definition";
import { matchesBumpPattern } from "../engine/registry-client";
import { SDK_CATALOG_PINS, INFRA_CATALOG_FLOOR } from "../templates/generated/root-pnpm-workspace";
import type { BlockVars } from "../engine/api";

const VARS: BlockVars = {
  facadeName: "@platforma-open/test-org.demo",
  baseName: "test-org.demo",
  npmOrg: "@platforma-open",
  orgScope: "test-org",
  shortName: "demo",
};

// A distinct mock "latest" per SDK package so we can prove per-name
// resolution. Anything not in the SDK pin set resolves to undefined.
const LATEST: Record<string, string> = Object.fromEntries(
  Object.keys(SDK_CATALOG_PINS).map((n, i) => [n, `9${i}.4.2`]),
);
const mockLookup = (name: string): string | undefined => LATEST[name];

function catalogOf(yamlText: string): Record<string, string> {
  return (parseYaml(yamlText) as { catalog: Record<string, string> }).catalog;
}

describe("version model — init fetch + no-pin-on-refresh", () => {
  test("init writes latest SDK versions; infra floor stays ~-pinned", async () => {
    const { fs } = await simulateInit({ vars: VARS, registryLookup: mockLookup });
    const cat = catalogOf(await fs.read("pnpm-workspace.yaml"));

    // Every SDK family entry resolved to the mocked latest (exact, no modifier).
    for (const name of Object.keys(SDK_CATALOG_PINS)) {
      expect(matchesBumpPattern(name)).toBe(true);
      expect(cat[name]).toBe(LATEST[name]);
    }
    // Infra floor untouched — still its curated `~` pin.
    for (const [name, floor] of Object.entries(INFRA_CATALOG_FLOOR)) {
      expect(cat[name]).toBe(floor);
    }
  });

  test("default refresh touches NO catalog versions (byte-identical)", async () => {
    const { fs } = await simulateInit({ vars: VARS, registryLookup: mockLookup });
    const afterInit = await fs.read("pnpm-workspace.yaml");

    // A real default refresh — no registryLookup passed, proving refresh
    // never fetches. The onInitOrUpdate bump leaf is excluded from "default".
    const refreshCtx = await discoverRunContext({ fs, isSdkInternal: false });
    await engineRun(STRUCTURE, fs, refreshCtx, {
      templates: defaultTemplateProvider(),
      rediscover: async () => discoverRunContext({ fs, isSdkInternal: false, dryRun: true }),
    });

    const afterRefresh = await fs.read("pnpm-workspace.yaml");
    expect(afterRefresh).toBe(afterInit);
  });

  test("init = fixpoint of check: dry-run reports no pnpm-workspace.yaml change", async () => {
    const { fs, ctx } = await simulateInit({ vars: VARS, registryLookup: mockLookup });
    const checkCtx = { ...ctx, dryRun: true };
    const result = await engineRun(STRUCTURE, fs, checkCtx, {
      templates: defaultTemplateProvider(),
    });
    const workspaceChange = result.changes.find((c) => c.path === "pnpm-workspace.yaml");
    expect(workspaceChange).toBeUndefined();
  });
});
