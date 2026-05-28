// Layer-2 invariant — `init → check` must report zero diff for every
// supported BlockVars variant. testing-strategy.md § "Layer 2".
//
// For each variant:
//  1. simulateInit populates an in-memory FS with seeds + scaffolds +
//     fixed + managed in canonical form.
//  2. engine.run is invoked with `dryRun: true` on the same FS.
//  3. result.changes must be empty (every primitive idempotent).

import { describe, test, expect } from "vitest";
import type { BlockVars, RunContext } from "../engine/api";
import { STRUCTURE } from "../structure-definition";
import { run as engineRun } from "../engine/runner";
import { defaultTemplateProvider, simulateInit } from "../engine/testing";

const TEMPLATES = defaultTemplateProvider();

async function checkZeroDiff(vars: BlockVars): Promise<void> {
  const { fs, ctx } = await simulateInit({ vars });
  const checkCtx: RunContext = { ...ctx, dryRun: true };
  const result = await engineRun(STRUCTURE, fs, checkCtx, { templates: TEMPLATES });
  if (result.changes.length > 0) {
    // Surface the first diff for diagnostics.
    const first = result.changes[0]!;
    throw new Error(
      `Layer-2 invariant violated for ${vars.facadeName}: ` +
        `${first.primitive} '${first.path}' (scope=${first.scope}, action=${first.action}). ` +
        `Total changes: ${result.changes.length}.`,
    );
  }
  expect(result.changes).toEqual([]);
}

describe("Layer-2: init → check zero diff", () => {
  test("with software × Python", async () => {
    const vars: BlockVars = {
      facadeName: "@platforma-open/test-org.demo",
      baseName: "test-org.demo",
      npmOrg: "@platforma-open",
      orgScope: "test-org",
      shortName: "demo",
      softwarePlatforms: ["python"],
    };
    await checkZeroDiff(vars);
  });

  test("with software × Tengo", async () => {
    const vars: BlockVars = {
      facadeName: "@platforma-open/test-org.demo",
      baseName: "test-org.demo",
      npmOrg: "@platforma-open",
      orgScope: "test-org",
      shortName: "demo",
      softwarePlatforms: ["tengo"],
    };
    await checkZeroDiff(vars);
  });

  test("no software", async () => {
    const vars: BlockVars = {
      facadeName: "@platforma-open/test-org.demo",
      baseName: "test-org.demo",
      npmOrg: "@platforma-open",
      orgScope: "test-org",
      shortName: "demo",
    };
    await checkZeroDiff(vars);
  });
});
