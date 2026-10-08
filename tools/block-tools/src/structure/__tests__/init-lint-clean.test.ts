// `ts-builder format` runs oxlint with `--deny-warnings`, so one unused
// parameter in a seeded file fails `pnpm fmt` — the last step of `upgrade-sdk`.

import { describe, test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { simulateInit } from "../engine/testing";
import { resolveToolBin } from "./tool-bin";
import type { BlockVars } from "../engine/api";

const VARS: BlockVars = {
  facadeName: "@platforma-open/test-org.demo",
  baseName: "test-org.demo",
  npmOrg: "@platforma-open",
  orgScope: "test-org",
  shortName: "demo",
};

function resolveTsBuilderConfig(configFile: string): string {
  return fileURLToPath(import.meta.resolve(`@milaboratories/ts-builder/configs/${configFile}`));
}

/** ts-builder pins its own oxlint, so block-tools' copy is a different version —
 *  resolve from inside ts-builder to get the one its configs were written for.
 *  See tool-bin.ts for why this goes through the `bin` field rather than
 *  node_modules/.bin. */
function resolveOxlintBinary(): string | undefined {
  return resolveToolBin(resolveTsBuilderConfig("oxlint-base.json"), "oxlint");
}

/** The scopes whose `fmt` script lints. */
const LINTED_SCOPES = ["kind", "model", "test", "ui"];

describe("init output is lint-clean (oxlint --deny-warnings)", () => {
  const oxlint = resolveOxlintBinary();

  test.runIf(oxlint)("every seeded source passes its scope's oxlint config", () => {
    const { fs } = simulateInit({ vars: VARS });
    const root = mkdtempSync(path.join(tmpdir(), "init-lint-clean-"));

    for (const scope of LINTED_SCOPES) {
      const configPath = `${scope}/.oxlintrc.json`;
      expect(fs.exists(configPath), `${scope} must carry an .oxlintrc.json`).toBe(true);

      // The generated `extends` are relative to an installed node_modules.
      const config = JSON.parse(fs.read(configPath)) as { extends?: string[] };
      const extendsAbsolute = (config.extends ?? []).map((entry) =>
        resolveTsBuilderConfig(path.basename(entry)),
      );
      expect(
        extendsAbsolute.length,
        `${scope}/.oxlintrc.json must extend a config`,
      ).toBeGreaterThan(0);

      mkdirSync(path.join(root, scope), { recursive: true });
      writeFileSync(
        path.join(root, scope, ".oxlintrc.json"),
        JSON.stringify({ ...config, extends: extendsAbsolute }),
      );
      for (const file of fs.list(`${scope}/src`)) {
        const target = path.join(root, file);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, fs.read(file));
      }

      const result = spawnSync(
        process.execPath,
        [oxlint!, "--config", path.join(root, scope, ".oxlintrc.json"), "--deny-warnings", "src"],
        { cwd: path.join(root, scope), encoding: "utf-8" },
      );
      expect(
        result.status,
        `seeded ${scope}/src is not lint-clean, so \`pnpm run fmt\` (and with it ` +
          `\`pnpm run upgrade-sdk\`) fails on a fresh block:\n${result.stdout}\n${result.stderr}`,
      ).toBe(0);
    }
  });

  if (!oxlint) {
    test.skip("oxlint binary unavailable — skipping lint-clean guard", () => {});
  }
});
