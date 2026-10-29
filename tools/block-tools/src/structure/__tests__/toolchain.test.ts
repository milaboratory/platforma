// A block must run on the SDK's Node and pnpm: `upgrade-sdk` aligns it.

import { readFileSync } from "node:fs";
import { satisfies } from "semver";
import { describe, expect, test } from "vitest";
import { parse as parseYaml, parseDocument } from "yaml";
import type { BlockVars } from "../engine/api";
import type { MemoryFileSystem } from "../engine/fs/memory";
import { discoverRunContext } from "../engine/discovery-fs";
import { run as engineRun } from "../engine/runner";
import { defaultTemplateProvider, simulateInit } from "../engine/testing";
import {
  MINIMUM_RELEASE_AGE_EXCLUDE,
  NODE_RUNTIME,
  NODE_VERSION,
  PACKAGE_MANAGER,
  REQUIRED_BUILDS,
  SKIPPED_BUILDS,
  TURBO_VERSION,
} from "../rules/shared/toolchain";
import { STRUCTURE } from "../structure-definition";

const VARS: BlockVars = {
  facadeName: "@platforma-open/test-org.demo",
  baseName: "test-org.demo",
  npmOrg: "@platforma-open",
  orgScope: "test-org",
  shortName: "demo",
};

const readMonorepoFile = (relativePath: string) =>
  readFileSync(new URL(`../../../../../${relativePath}`, import.meta.url), "utf-8");

function refresh(fs: MemoryFileSystem) {
  return engineRun(STRUCTURE, fs, discoverRunContext({ fs, isSdkInternal: false }), {
    templates: defaultTemplateProvider(),
    rediscover: () => discoverRunContext({ fs, isSdkInternal: false, dryRun: true }),
  });
}

function editJson(fs: MemoryFileSystem, edit: (json: Record<string, unknown>) => void) {
  const json = JSON.parse(fs.read("package.json"));
  edit(json);
  fs.write("package.json", JSON.stringify(json, null, 2) + "\n");
}

function editWorkspace(
  fs: MemoryFileSystem,
  edit: (doc: ReturnType<typeof parseDocument>) => void,
) {
  const doc = parseDocument(fs.read("pnpm-workspace.yaml"));
  edit(doc);
  fs.write("pnpm-workspace.yaml", doc.toString());
}

const readWorkspace = (fs: MemoryFileSystem) => parseYaml(fs.read("pnpm-workspace.yaml"));

describe("block toolchain", () => {
  test("matches the SDK monorepo", () => {
    const root = JSON.parse(readMonorepoFile("package.json"));
    expect(PACKAGE_MANAGER).toBe(root.packageManager);
    const setup = parseYaml(readMonorepoFile(".github/actions/setup/action.yml"));
    expect(NODE_VERSION).toBe(setup.inputs["node-version"].default);
    const workspace = parseYaml(readMonorepoFile("pnpm-workspace.yaml"));
    expect(MINIMUM_RELEASE_AGE_EXCLUDE).toEqual(workspace.minimumReleaseAgeExclude);
    expect(satisfies(workspace.catalog.turbo, TURBO_VERSION)).toBe(true);
    expect(workspace.allowBuilds).toMatchObject({ ...REQUIRED_BUILDS, ...SKIPPED_BUILDS });
  });

  test("refresh moves an old block to the SDK pnpm and Node", () => {
    const { fs } = simulateInit({ vars: VARS });
    editJson(fs, (json) => {
      json.packageManager = "pnpm@9.12.0";
      delete json.devEngines;
      json.pnpm = { overrides: {} };
    });
    editWorkspace(fs, (doc) => {
      doc.delete("minimumReleaseAgeExclude");
      doc.delete("allowBuilds");
      doc.setIn(["catalog", "turbo"], "~2.8.11");
    });

    refresh(fs);

    const pkg = JSON.parse(fs.read("package.json"));
    expect(pkg.packageManager).toBe(PACKAGE_MANAGER);
    expect(pkg.devEngines).toEqual({ runtime: NODE_RUNTIME });
    expect(pkg.pnpm).toBeUndefined();
    const workspace = readWorkspace(fs);
    expect(workspace.minimumReleaseAgeExclude).toEqual(MINIMUM_RELEASE_AGE_EXCLUDE);
    expect(workspace.allowBuilds).toEqual({ ...SKIPPED_BUILDS, ...REQUIRED_BUILDS });
    expect(workspace.catalog.turbo).toBe(TURBO_VERSION);
  });

  test("refresh replaces only the runtime among the author's engines", () => {
    const { fs } = simulateInit({ vars: VARS });
    const packageManager = { name: "pnpm", version: "12.16.1" };
    editJson(fs, (json) => {
      json.engines = { node: ">=20" };
      json.devEngines = { packageManager, runtime: { name: "node", version: "22" } };
    });

    refresh(fs);

    const pkg = JSON.parse(fs.read("package.json"));
    expect(pkg.devEngines).toEqual({ packageManager, runtime: NODE_RUNTIME });
    expect(pkg.engines).toEqual({ node: ">=20" });
    const toolchainKeys = ["devEngines", "engines", "packageManager"];
    expect(Object.keys(pkg).filter((key) => toolchainKeys.includes(key))).toEqual(toolchainKeys);
  });

  test("refresh keeps the author's workspace settings", () => {
    const { fs } = simulateInit({ vars: VARS });
    editWorkspace(fs, (doc) => {
      doc.set("overrides", { zod: "~3.25.76" });
      doc.setIn(["allowBuilds", "sharp"], true);
      doc.setIn(["allowBuilds", "esbuild"], true);
      doc.setIn(["allowBuilds", "@milaboratories/pframes-rs-node"], false);
      doc.setIn(["catalog", "turbo"], "~2.12.3");
    });

    refresh(fs);

    const workspace = readWorkspace(fs);
    expect(workspace.overrides).toEqual({ zod: "~3.25.76" });
    expect(workspace.allowBuilds).toEqual({
      ...SKIPPED_BUILDS,
      ...REQUIRED_BUILDS,
      sharp: true,
      esbuild: true,
    });
    expect(workspace.catalog.turbo).toBe("~2.12.3");
  });

  test("refresh fills empty workspace settings", () => {
    const { fs } = simulateInit({ vars: VARS });
    editWorkspace(fs, (doc) => {
      doc.set("minimumReleaseAgeExclude", null);
      doc.set("allowBuilds", null);
    });

    refresh(fs);

    const workspace = readWorkspace(fs);
    expect(workspace.minimumReleaseAgeExclude).toEqual(MINIMUM_RELEASE_AGE_EXCLUDE);
    expect(workspace.allowBuilds).toEqual({ ...SKIPPED_BUILDS, ...REQUIRED_BUILDS });
  });

  test("refresh refuses a package.json pnpm field with settings", () => {
    const { fs } = simulateInit({ vars: VARS });
    editJson(fs, (json) => {
      json.pnpm = { overrides: { zod: "~3.25.76" } };
    });
    expect(() => refresh(fs)).toThrow(/pnpm-workspace\.yaml/);
  });
});
