// Root CI workflow files (`rules/root-ci.ts`) — `fixed`, generated from the
// block's short name. These rules are `!isSdkInternal`, so the `etc/blocks`
// check-blocks run never exercises them; this is their only coverage.
//
// Asserts: init writes both workflows with derived identity (app-name /
// app-name-slug) + shared constants (team-id, the `@v4` pins, test: true);
// the files are idempotent (init → check zero diff); and `--sdk-internal`
// blocks get neither file.

import { describe, test, expect } from "vitest";
import type { BlockVars, RunContext } from "../engine/api";
import { STRUCTURE } from "../structure-definition";
import { run as engineRun } from "../engine/runner";
import { defaultTemplateProvider, simulateInit } from "../engine/testing";

const TEMPLATES = defaultTemplateProvider();

const VARS: BlockVars = {
  facadeName: "@platforma-open/milaboratories.mixcr-clonotyping-2",
  baseName: "milaboratories.mixcr-clonotyping-2",
  npmOrg: "@platforma-open",
  orgScope: "milaboratories",
  shortName: "mixcr-clonotyping-2",
};

const BUILD = ".github/workflows/build.yaml";
const MARK_STABLE = ".github/workflows/mark-stable.yaml";

describe("root CI workflows (fixed, generated)", () => {
  test("init writes both workflows with derived identity + shared constants", () => {
    const { fs } = simulateInit({ vars: VARS });

    const build = fs.read(BUILD);
    // Derived identity from the short name.
    expect(build).toContain("app-name: 'Block: Mixcr Clonotyping 2'");
    expect(build).toContain("app-name-slug: 'block-mixcr-clonotyping-2'");
    // Shared constants.
    expect(build).toContain("team-id: 'ciplopen'");
    expect(build).toContain("test: true");
    // No bare `build` script exists (root-package-json removes it), so both
    // build legs must name scenario flavors: PR/test validates locally, the
    // publish leg builds the release channel.
    expect(build).toContain("build-script-name: 'build:dev-local'");
    expect(build).toContain("build-before-publish-script-name: 'build:release'");
    // The reusable-workflow pins — the whole point of engine-owning the file.
    expect(build).toContain(
      "uses: milaboratory/github-ci/.github/workflows/node-simple-pnpm.yaml@v4",
    );
    expect(build).toContain("uses: milaboratory/github-ci/actions/context/init@v4");
    // `${{ ... }}` GitHub expressions survive `tpl` substitution untouched.
    expect(build).toContain("${{ toJSON(secrets.NPMJS_TOKEN) }}");

    const markStable = fs.read(MARK_STABLE);
    expect(markStable).toContain("app-name: 'Block: Mixcr Clonotyping 2 - Mark Stable'");
    expect(markStable).toContain(
      "uses: milaboratory/github-ci/.github/workflows/block-mark-stable.yaml@v4",
    );
  });

  test("init → check is zero-diff for the workflow files (fixed idempotency)", () => {
    const { fs, ctx } = simulateInit({ vars: VARS });
    const checkCtx: RunContext = { ...ctx, dryRun: true };
    const result = engineRun(STRUCTURE, fs, checkCtx, { templates: TEMPLATES });
    const ciChanges = result.changes.filter((c) => c.path === BUILD || c.path === MARK_STABLE);
    expect(ciChanges).toEqual([]);
  });

  test("sdk-internal blocks get neither workflow file", () => {
    const { fs } = simulateInit({ vars: VARS, isSdkInternal: true });
    expect(fs.exists(BUILD)).toBe(false);
    expect(fs.exists(MARK_STABLE)).toBe(false);
  });
});
