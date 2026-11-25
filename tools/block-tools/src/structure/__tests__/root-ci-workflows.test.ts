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
import { discoverRunContext } from "../engine/discovery-fs";
import { readStructureMeta, STRUCTURE_META_FILE } from "../engine/version";
import { NODE_VERSION } from "../rules/shared/toolchain";

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
    // Both workflows run the SDK's Node.
    expect(build).toContain(`node-version: '${NODE_VERSION}'`);
    expect(fs.read(MARK_STABLE)).toContain(`node-version: '${NODE_VERSION}'`);
    // Opt-in gate: the published `block` package must be bumped on PRs.
    expect(build).toContain("require-package-path-bump: true");
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

  test("by default the workflow publishes to the own registry", () => {
    const { fs, ctx } = simulateInit({ vars: VARS });
    expect(ctx.ownNpmRegistry).toBe(true);
    const build = fs.read(BUILD);
    expect(build.match(/npm-own-registry-scopes: '@platforma-open'/g)).toHaveLength(1);
    // The default is not written: a block on it keeps {"version":N}.
    expect(fs.read(STRUCTURE_META_FILE)).not.toContain("ownNpmRegistry");
    expect(discoverRunContext({ fs, isSdkInternal: false }).ownNpmRegistry).toBe(true);
  });

  test("ownNpmRegistry: false opts out, and refresh keeps the opt-out", () => {
    const { fs } = simulateInit({ vars: VARS });
    const meta = readStructureMeta(fs);
    fs.write(STRUCTURE_META_FILE, JSON.stringify({ ...meta, ownNpmRegistry: false }));

    const ctx = discoverRunContext({ fs, isSdkInternal: false });
    expect(ctx.ownNpmRegistry).toBe(false);
    engineRun(STRUCTURE, fs, ctx, { templates: TEMPLATES });

    const build = fs.read(BUILD);
    expect(build).not.toContain("npm-own-registry-scopes");
    // The placeholder expands to nothing: the next line follows directly.
    expect(build).toContain("require-package-path-bump: true\n\n      npmrc-config: |");
    // Refresh rewrote .structure and kept the opt-out.
    expect(readStructureMeta(fs).ownNpmRegistry).toBe(false);

    // Fixpoint: a check right after changes nothing in the workflow files.
    const checkCtx: RunContext = {
      ...discoverRunContext({ fs, isSdkInternal: false }),
      dryRun: true,
    };
    const result = engineRun(STRUCTURE, fs, checkCtx, { templates: TEMPLATES });
    expect(result.changes.filter((c) => c.path === BUILD || c.path === MARK_STABLE)).toEqual([]);
  });

  test("removing the opt-out brings the input back on refresh", () => {
    const { fs } = simulateInit({ vars: VARS });
    const meta = readStructureMeta(fs);
    fs.write(STRUCTURE_META_FILE, JSON.stringify({ ...meta, ownNpmRegistry: false }));
    engineRun(STRUCTURE, fs, discoverRunContext({ fs, isSdkInternal: false }), {
      templates: TEMPLATES,
    });
    expect(fs.read(BUILD)).not.toContain("npm-own-registry-scopes");

    fs.write(STRUCTURE_META_FILE, JSON.stringify({ version: meta.version }));
    engineRun(STRUCTURE, fs, discoverRunContext({ fs, isSdkInternal: false }), {
      templates: TEMPLATES,
    });
    expect(fs.read(BUILD)).toContain("npm-own-registry-scopes");
  });

  test("an explicit ownNpmRegistry: true (opt-in period) is kept on and dropped from .structure", () => {
    const { fs } = simulateInit({ vars: VARS });
    const meta = readStructureMeta(fs);
    fs.write(STRUCTURE_META_FILE, JSON.stringify({ ...meta, ownNpmRegistry: true }));
    engineRun(STRUCTURE, fs, discoverRunContext({ fs, isSdkInternal: false }), {
      templates: TEMPLATES,
    });
    expect(fs.read(BUILD).match(/npm-own-registry-scopes: '@platforma-open'/g)).toHaveLength(1);
    expect(fs.read(STRUCTURE_META_FILE)).toBe(JSON.stringify({ version: meta.version }));
  });

  test("sdk-internal blocks get neither workflow file", () => {
    const { fs } = simulateInit({ vars: VARS, isSdkInternal: true });
    expect(fs.exists(BUILD)).toBe(false);
    expect(fs.exists(MARK_STABLE)).toBe(false);
  });
});
