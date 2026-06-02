// Invariant — `init → check` must report zero diff for every supported
// BlockVars variant.
//
// For each variant:
//  1. simulateInit populates an in-memory FS with seeds + scaffolds +
//     fixed + managed in canonical form, then re-discovers the module set
//     from that written FS (the same DISCOVERY `check` runs) — a real
//     init→check round-trip, not a reuse of init's module set.
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
  test("with software (single platform)", async () => {
    const vars: BlockVars = {
      facadeName: "@platforma-open/test-org.demo",
      baseName: "test-org.demo",
      npmOrg: "@platforma-open",
      orgScope: "test-org",
      shortName: "demo",
      softwarePlatform: "python",
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
