// `structure init` and `structure refresh` read their templates from the
// installed package. `pnpm pack` (pnpm 11+) follows npm's pack rules and
// leaves some files out, `.gitignore` among them: block-tools 2.17.0 shipped
// without `templates/static/root/.gitignore`, so `structure init` failed with
// ENOENT. This test packs the package with the pnpm that the release uses and
// checks that every template file in git is in the package.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/** The block-tools package directory. */
const PACKAGE_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/** The template tree that the structure commands read, relative to PACKAGE_ROOT. */
const TEMPLATES_DIR = "src/structure/templates";

/** Runs a command in PACKAGE_ROOT and returns its stdout. Throws when it fails. */
function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { cwd: PACKAGE_ROOT, encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(
      `\`${command} ${args.join(" ")}\` failed: ${result.error?.message ?? result.stderr}`,
    );
  }
  return result.stdout;
}

describe("published package", () => {
  test("contains every template file", () => {
    const templates = run("git", ["ls-files", "-z", "--", TEMPLATES_DIR])
      .split("\0")
      .filter((file) => file !== "");
    const packResult: { files: { path: string }[] } = JSON.parse(
      run("pnpm", ["pack", "--dry-run", "--json"]),
    );
    const packed = new Set(packResult.files.map((file) => file.path));

    expect(templates.length).toBeGreaterThan(0);
    expect(
      templates.filter((file) => !packed.has(file)),
      "template files that `pnpm pack` leaves out of the package",
    ).toEqual([]);
  });
});
