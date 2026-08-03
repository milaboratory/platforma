import { afterEach, describe, expect, test } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import fsp from "node:fs/promises";
import type { MiLogger } from "@milaboratories/ts-helpers";
import type { VersionType } from "@changesets/types";
import getChangesets from "@changesets/read";
import { read as readConfig } from "@changesets/config";
import assembleReleasePlan from "@changesets/assemble-release-plan";
import { readPreState } from "@changesets/pre";
import { getPackages } from "@manypkg/get-packages";
import { runVersion } from "./version";

// --- fixture helpers ---------------------------------------------------------

const createdDirs: string[] = [];
afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map((d) => fsp.rm(d, { recursive: true, force: true })));
});

type PkgSpec = {
  dir: string;
  name: string;
  version: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type WorkspaceSpec = {
  packages: PkgSpec[];
  changesets?: { name: string; bumps: Record<string, VersionType>; summary?: string }[];
  updateInternalDependencies?: "patch" | "minor";
  commit?: boolean;
  changelogModule?: string; // when set, written to ./changelog.cjs and used as config.changelog
  pre?: { tag: string; initialVersions: Record<string, string> };
};

async function writeJson(file: string, value: unknown): Promise<void> {
  await fsp.writeFile(file, JSON.stringify(value, null, 2) + "\n");
}

async function makeWorkspace(spec: WorkspaceSpec): Promise<string> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "bt-version-"));
  createdDirs.push(root);

  await writeJson(path.join(root, "package.json"), {
    name: "fixture-root",
    version: "0.0.0",
    private: true,
  });
  await fsp.writeFile(
    path.join(root, "pnpm-workspace.yaml"),
    "packages:\n" + spec.packages.map((p) => `  - ${p.dir}`).join("\n") + "\n",
  );

  for (const p of spec.packages) {
    const dir = path.join(root, p.dir);
    await fsp.mkdir(dir, { recursive: true });
    const pj: Record<string, unknown> = { name: p.name, version: p.version };
    if (p.private) pj.private = true;
    if (p.dependencies) pj.dependencies = p.dependencies;
    if (p.devDependencies) pj.devDependencies = p.devDependencies;
    await writeJson(path.join(dir, "package.json"), pj);
  }

  const csDir = path.join(root, ".changeset");
  await fsp.mkdir(csDir, { recursive: true });

  let changelog: unknown = false;
  if (spec.changelogModule) {
    await fsp.writeFile(path.join(root, "changelog.cjs"), spec.changelogModule);
    changelog = "./changelog.cjs";
  }

  await writeJson(path.join(csDir, "config.json"), {
    $schema: "https://unpkg.com/@changesets/config@3.1.1/schema.json",
    changelog,
    commit: spec.commit ?? false,
    fixed: [],
    linked: [],
    access: "restricted",
    baseBranch: "main",
    updateInternalDependencies: spec.updateInternalDependencies ?? "patch",
    ignore: [],
  });

  for (const cs of spec.changesets ?? []) {
    const fm = Object.entries(cs.bumps)
      .map(([n, t]) => `"${n}": ${t}`)
      .join("\n");
    await fsp.writeFile(
      path.join(csDir, `${cs.name}.md`),
      `---\n${fm}\n---\n\n${cs.summary ?? "a change"}\n`,
    );
  }

  if (spec.pre) {
    await writeJson(path.join(csDir, "pre.json"), {
      mode: "pre",
      tag: spec.pre.tag,
      initialVersions: spec.pre.initialVersions,
      changesets: [],
    });
  }

  return root;
}

function capturingLogger(): {
  logger: MiLogger;
  infos: string[];
  warns: string[];
  errors: string[];
} {
  const infos: string[] = [];
  const warns: string[] = [];
  const errors: string[] = [];
  const logger: MiLogger = {
    info: (m) => infos.push(String(m)),
    warn: (m) => warns.push(String(m)),
    error: (m) => errors.push(String(m)),
  };
  return { logger, infos, warns, errors };
}

async function versionOf(root: string, dir: string): Promise<string> {
  const pj = JSON.parse(await fsp.readFile(path.join(root, dir, "package.json"), "utf8"));
  return pj.version as string;
}

// The standard block topology: publishable `block` consumes the private siblings
// through `devDependencies` (workspace:*); ui/test consume model through
// `dependencies` (the natively-cascading edge).
function blockTopology(overrides?: Partial<Record<string, PkgSpec>>): PkgSpec[] {
  const base: Record<string, PkgSpec> = {
    block: {
      dir: "block",
      name: "@acme/blk",
      version: "2.0.0",
      devDependencies: {
        "@acme/blk.model": "workspace:*",
        "@acme/blk.ui": "workspace:*",
        "@acme/blk.workflow": "workspace:*",
      },
    },
    model: { dir: "model", name: "@acme/blk.model", version: "1.0.0", private: true },
    ui: {
      dir: "ui",
      name: "@acme/blk.ui",
      version: "1.0.0",
      private: true,
      dependencies: { "@acme/blk.model": "workspace:*" },
    },
    workflow: { dir: "workflow", name: "@acme/blk.workflow", version: "1.0.0", private: true },
    test: {
      dir: "test",
      name: "@acme/blk.test",
      version: "1.0.0",
      private: true,
      dependencies: { "@acme/blk.model": "workspace:*" },
    },
  };
  return Object.values({ ...base, ...overrides });
}

// --- tests -------------------------------------------------------------------

test("model minor -> block gets a (mirror-capped) minor; ui/test cascade patch", async () => {
  const root = await makeWorkspace({
    packages: blockTopology(),
    changesets: [{ name: "cs1", bumps: { "@acme/blk.model": "minor" } }],
  });
  const { logger, warns } = capturingLogger();

  // Delta vs stock changesets: the block would NOT be bumped (devDep-only edge -> none).
  const packages = await getPackages(root);
  const config = await readConfig(root, packages);
  const stock = assembleReleasePlan(
    await getChangesets(root),
    packages,
    config,
    await readPreState(root),
  );
  expect(stock.releases.find((r) => r.name === "@acme/blk")?.type ?? "none").toBe("none");

  await runVersion(root, logger);

  expect(await versionOf(root, "model")).toBe("1.1.0"); // minor
  expect(await versionOf(root, "ui")).toBe("1.0.1"); // native patch cascade
  expect(await versionOf(root, "test")).toBe("1.0.1"); // native patch cascade
  expect(await versionOf(root, "block")).toBe("2.1.0"); // injected minor (mirrors model)
  expect(warns).toHaveLength(0);
});

test("workflow patch -> block patch (no other siblings released)", async () => {
  const root = await makeWorkspace({
    packages: blockTopology(),
    changesets: [{ name: "cs1", bumps: { "@acme/blk.workflow": "patch" } }],
  });
  const { logger } = capturingLogger();

  await runVersion(root, logger);

  expect(await versionOf(root, "workflow")).toBe("1.0.1");
  expect(await versionOf(root, "block")).toBe("2.0.1"); // injected patch
  expect(await versionOf(root, "model")).toBe("1.0.0"); // untouched
  expect(await versionOf(root, "ui")).toBe("1.0.0");
});

test("sibling major -> block capped to minor + warning", async () => {
  const root = await makeWorkspace({
    packages: blockTopology(),
    changesets: [{ name: "cs1", bumps: { "@acme/blk.model": "major" } }],
  });
  const { logger, warns } = capturingLogger();

  await runVersion(root, logger);

  expect(await versionOf(root, "model")).toBe("2.0.0"); // major
  expect(await versionOf(root, "block")).toBe("2.1.0"); // capped to minor, NOT 3.0.0
  expect(warns).toHaveLength(1);
  expect(warns[0]).toMatch(/MAJOR/);
  expect(warns[0]).toContain("@acme/blk.model");
});

test("author-written block:major survives uncapped even with a minor sibling", async () => {
  const root = await makeWorkspace({
    packages: blockTopology(),
    changesets: [
      { name: "cs1", bumps: { "@acme/blk.model": "minor" } },
      { name: "cs2", bumps: { "@acme/blk": "major" } },
    ],
  });
  const { logger, warns } = capturingLogger();

  await runVersion(root, logger);

  expect(await versionOf(root, "block")).toBe("3.0.0"); // author's major stands, not lowered to minor
  expect(warns).toHaveLength(0);
});

test("chain: software -> workflow (native) -> block (injected)", async () => {
  const packages = blockTopology({
    workflow: {
      dir: "workflow",
      name: "@acme/blk.workflow",
      version: "1.0.0",
      private: true,
      dependencies: { "@acme/blk.software": "workspace:*" },
    },
    software: {
      dir: "software",
      name: "@acme/blk.software",
      version: "1.0.0",
      private: true,
    },
  });
  const root = await makeWorkspace({
    packages,
    changesets: [{ name: "cs1", bumps: { "@acme/blk.software": "minor" } }],
  });
  const { logger } = capturingLogger();

  await runVersion(root, logger);

  expect(await versionOf(root, "software")).toBe("1.1.0"); // minor
  expect(await versionOf(root, "workflow")).toBe("1.0.1"); // native patch cascade (dependencies)
  expect(await versionOf(root, "block")).toBe("2.0.1"); // injected patch, via workflow devDep
});

test("hard error when config.commit is true", async () => {
  const root = await makeWorkspace({
    packages: blockTopology(),
    changesets: [{ name: "cs1", bumps: { "@acme/blk.model": "minor" } }],
    commit: true,
  });
  const { logger } = capturingLogger();

  await expect(runVersion(root, logger)).rejects.toThrow(/commit: true/i);
  expect(await versionOf(root, "block")).toBe("2.0.0"); // nothing written
});

test("no changesets -> no-op", async () => {
  const root = await makeWorkspace({ packages: blockTopology(), changesets: [] });
  const { logger, infos } = capturingLogger();

  await runVersion(root, logger);

  expect(infos.some((m) => /No unreleased changesets found/i.test(m))).toBe(true);
  expect(await versionOf(root, "block")).toBe("2.0.0");
  expect(await versionOf(root, "model")).toBe("1.0.0");
});

test("block CHANGELOG shows the synthetic summary under the right heading", async () => {
  const root = await makeWorkspace({
    packages: blockTopology(),
    changesets: [{ name: "cs1", bumps: { "@acme/blk.model": "minor" } }],
    changelogModule:
      "module.exports = { default: {" +
      " getReleaseLine: async (cs) => `- ${cs.summary}`," +
      " getDependencyReleaseLine: async () => ``," +
      "} };\n",
  });
  const { logger } = capturingLogger();

  await runVersion(root, logger);

  const changelog = await fsp.readFile(path.join(root, "block", "CHANGELOG.md"), "utf8");
  expect(changelog).toContain("## 2.1.0");
  expect(changelog).toMatch(/### Minor Changes/);
  expect(changelog).toContain("Internal dependency updates: @acme/blk.model@1.1.0");
});

describe("pre mode", () => {
  test("block gets a pre-versioned bump on a single run", async () => {
    const root = await makeWorkspace({
      packages: blockTopology(),
      changesets: [{ name: "cs1", bumps: { "@acme/blk.model": "minor" } }],
      pre: {
        tag: "next",
        initialVersions: {
          "@acme/blk": "2.0.0",
          "@acme/blk.model": "1.0.0",
          "@acme/blk.ui": "1.0.0",
          "@acme/blk.workflow": "1.0.0",
          "@acme/blk.test": "1.0.0",
        },
      },
    });
    const { logger } = capturingLogger();

    await runVersion(root, logger);

    const block = await versionOf(root, "block");
    expect(block).not.toBe("2.0.0");
    expect(block).toContain("next"); // e.g. 2.1.0-next.0
  });
});
