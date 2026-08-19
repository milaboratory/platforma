// CI runs `pnpm run version-packages` on every PR, so a block with no
// `.changeset/config.json` fails its first CI run.

import { describe, test, expect } from "vitest";
import { simulateInit, defaultTemplateProvider } from "../engine/testing";
import { run as engineRun } from "../engine/runner";
import { discoverRunContext } from "../engine/discovery-fs";
import { STRUCTURE } from "../structure-definition";
import { MemoryFileSystem } from "../engine/fs/memory";
import type { BlockVars } from "../engine/api";

const VARS: BlockVars = {
  facadeName: "@platforma-open/test-org.demo",
  baseName: "test-org.demo",
  npmOrg: "@platforma-open",
  orgScope: "test-org",
  shortName: "demo",
};

const PATH = ".changeset/config.json";

function refresh(fs: MemoryFileSystem, isSdkInternal = false) {
  return engineRun(STRUCTURE, fs, discoverRunContext({ fs, isSdkInternal }), {
    templates: defaultTemplateProvider(),
    rediscover: () => discoverRunContext({ fs, isSdkInternal, dryRun: true }),
  });
}

describe("root .changeset/config.json", () => {
  test("init writes the config CI needs", () => {
    const { fs } = simulateInit({ vars: VARS });
    const config = JSON.parse(fs.read(PATH));
    expect(config.changelog).toBe("@changesets/cli/changelog");
    expect(config.commit).toBe(false);
    expect(config.access).toBe("restricted");
    expect(config.baseBranch).toBe("main");
    expect(config.updateInternalDependencies).toBe("patch");
  });

  test("refresh creates it for a block that predates the rule", () => {
    const { fs } = simulateInit({ vars: VARS });
    fs.delete(".changeset");
    expect(fs.exists(PATH)).toBe(false);

    refresh(fs);
    expect(JSON.parse(fs.read(PATH)).baseBranch).toBe("main");
  });

  test("refresh keeps author-owned lists and re-asserts the CI fields", () => {
    const { fs } = simulateInit({ vars: VARS });
    const authored = {
      ...JSON.parse(fs.read(PATH)),
      $schema: "https://unpkg.com/@changesets/config@3.0.2/schema.json",
      ignore: ["@platforma-open/test-org.demo.ui"],
      access: "public",
      "//privatePackages": "a note the author added",
    };
    fs.write(PATH, JSON.stringify(authored, null, 2));

    refresh(fs);
    const after = JSON.parse(fs.read(PATH));
    expect(after.ignore).toEqual(["@platforma-open/test-org.demo.ui"]);
    expect(after.$schema).toBe("https://unpkg.com/@changesets/config@3.0.2/schema.json");
    expect(after["//privatePackages"]).toBe("a note the author added");
    expect(after.access).toBe("restricted");
  });

  test("sdk-internal blocks get no config — the monorepo owns it", () => {
    const { fs } = simulateInit({ vars: VARS, isSdkInternal: true });
    expect(fs.exists(PATH)).toBe(false);
  });
});

describe("root .changeset/scaffold.md", () => {
  const SEED = ".changeset/scaffold.md";

  // An empty changeset names no package, so `changeset version` consumes it
  // without bumping. That is what keeps the first RELEASED facade version at
  // 1.0.0 instead of 1.0.1, and it passes CI's require-package-path-bump gate.
  test("init seeds an empty changeset — no package named", () => {
    const { fs } = simulateInit({ vars: VARS });
    const body = fs.read(SEED);
    expect(body.startsWith("---\n---\n")).toBe(true);
    expect(body).not.toContain(VARS.facadeName);
  });

  test("refresh does not resurrect it once a release consumed it", () => {
    const { fs } = simulateInit({ vars: VARS });
    fs.delete(SEED);

    refresh(fs);
    expect(fs.exists(SEED)).toBe(false);
  });
});
