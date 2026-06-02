// The model + ui scopes are the two `ts-builder check` runs oxfmt on, so
// their rules cede field / dependency ordering to oxfmt (no enforce* calls).
// This guard proves the init output is already oxfmt-clean — `oxfmt --check`
// passes with no prior `pnpm fmt` — so the first refresh/check is a no-op.
//
// Requires the `oxfmt` binary (declared as a block-tools devDep). When it
// is genuinely unavailable the test skips with a warning rather than
// failing an environment that has no formatter installed.

import { describe, test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { simulateInit } from "../engine/testing";
import type { BlockVars } from "../engine/api";

function oxfmtAvailable(): boolean {
  const r = spawnSync("oxfmt", ["--help"], { encoding: "utf-8" });
  return !r.error;
}

describe("oxfmt-clean init output (model + ui)", () => {
  const available = oxfmtAvailable();

  // Both files `ts-builder check` runs oxfmt on, per scope: package.json AND
  // tsconfig.json. tsconfig is the regression that motivated the
  // width-collapsing serialiser — oxfmt collapses its single-element
  // `include` array, which the plain `JSON.stringify` expansion left
  // non-clean. Guard both so a future serialiser change is caught here, not
  // in the build→check gate.
  const FILES = ["package.json", "tsconfig.json"];

  test.runIf(available)("model + ui init package.json + tsconfig pass oxfmt --check", async () => {
    const vars: BlockVars = {
      facadeName: "@platforma-open/test-org.demo",
      baseName: "test-org.demo",
      npmOrg: "@platforma-open",
      orgScope: "test-org",
      shortName: "demo",
    };
    const { fs } = await simulateInit({ vars });

    const root = mkdtempSync(path.join(tmpdir(), "oxfmt-clean-"));
    for (const scope of ["model", "ui"]) {
      mkdirSync(path.join(root, scope), { recursive: true });
      for (const fileName of FILES) {
        const content = await fs.read(`${scope}/${fileName}`);
        writeFileSync(path.join(root, scope, fileName), content);
        const r = spawnSync("oxfmt", ["--check", path.join(scope, fileName)], {
          cwd: root,
          encoding: "utf-8",
        });
        expect(r.status, `${scope}/${fileName} is not oxfmt-clean:\n${r.stdout}\n${r.stderr}`).toBe(
          0,
        );
      }
    }
  });

  if (!available) {
    test.skip("oxfmt binary unavailable — skipping oxfmt-clean guard", () => {});
  }
});
