// Regression tests for Core.buildDockerImages + Core.publishDockerImages.
//
// Locks in two properties:
//   1. each docker artifact is built and pushed exactly once across all
//      block-software entrypoint shapes (python/conda autogen, explicit
//      docker, java-only, multi-entrypoint). The autopush path used to
//      iterate over both buildablePackages and dockerPackages, which for
//      python→docker autogen counted the same artifact twice.
//   2. the strict-platform gate keeps non-linux/x64 hosts out of the
//      build+publish path in CI, so the matrix doesn't fan out duplicate
//      pushes from arm/windows legs.
//
// docker.* is module-mocked so the tests don't shell out to the real
// docker daemon. PackageInfo is constructed against a tmpdir with a
// minimal package.json + the bits each shape needs (requirements.txt for
// python, a stub runenv .sw.json for python autogen).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type winston from "winston";

import { Core } from "../core";
import * as docker from "../docker";
import * as util from "../util";

vi.mock("../docker", async (importOriginal) => {
  const real = await importOriginal<typeof docker>();
  return {
    ...real,
    build: vi.fn(),
    push: vi.fn(),
    addTag: vi.fn(),
    removeTag: vi.fn(),
    getImageHash: vi.fn(() => "deadbeef0123"),
    getImageEntrypoint: vi.fn(() => [] as string[]),
    localImageExists: vi.fn(() => true),
    remoteImageExists: vi.fn(() => false),
  };
});

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
} as unknown as winston.Logger;

// Minimal stub for the python runenv .sw.json that PackageInfo's python
// autogen path resolves through `node_modules`. Only the runEnv block is
// inspected by docker-python so we keep this tiny.
function writeRunenvSwJson(packageRoot: string, refId: string, pythonVersion: string) {
  const [pkgName, ep] = refId.split(":");
  const swPath = path.join(
    packageRoot,
    "node_modules",
    pkgName,
    "dist",
    "tengo",
    "software",
    `${ep}.sw.json`,
  );
  fs.mkdirSync(path.dirname(swPath), { recursive: true });
  fs.writeFileSync(
    swPath,
    JSON.stringify({
      name: `${pkgName}:${ep}`,
      runEnv: {
        type: "python",
        "python-version": pythonVersion,
        envVars: [],
        registry: "test-runenv-registry",
        package: "software/test/py-{os}-{arch}.tgz",
        binDir: ".",
      },
    }),
  );
}

function makePackageRoot(
  tmpDir: string,
  pkgJson: Record<string, unknown>,
  extras?: {
    requirementsTxt?: boolean;
    runenv?: { ref: string; pythonVersion: string };
    dockerContext?: string;
  },
): string {
  const root = path.join(tmpDir, "pkg");
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify(pkgJson));

  if (extras?.requirementsTxt) {
    fs.writeFileSync(path.join(root, "src", "requirements.txt"), "");
  }
  if (extras?.runenv) {
    writeRunenvSwJson(root, extras.runenv.ref, extras.runenv.pythonVersion);
  }
  if (extras?.dockerContext) {
    fs.mkdirSync(path.join(root, extras.dockerContext), { recursive: true });
    // dockerSchema defaults the Dockerfile path to <root>/Dockerfile, separate
    // from the context dir. Provide both.
    fs.writeFileSync(path.join(root, "Dockerfile"), "FROM scratch\n");
    fs.writeFileSync(path.join(root, extras.dockerContext, ".keep"), "");
  }

  return root;
}

const RUNENV_REF = "@test/runenv-py:py3";

const pythonEntrypoint = {
  binary: {
    artifact: {
      type: "python",
      registry: "platforma-open",
      environment: RUNENV_REF,
      root: "./src",
      dependencies: { toolset: "pip", requirements: "requirements.txt" },
    },
    cmd: ["python", "{pkg}/main.py"],
  },
};

const javaEntrypoint = {
  binary: {
    artifact: {
      type: "java",
      registry: "platforma-open",
      environment: RUNENV_REF,
      // 'roots' is omitted for java in the schema; archiveRulesSchema requires root.
      root: "./src",
    },
    cmd: ["java", "-jar", "{pkg}/app.jar"],
  },
};

const explicitDockerEntrypoint = {
  docker: {
    artifact: {
      context: "docker-context",
    },
    cmd: ["echo", "hello"],
  },
};

describe("Core.buildDockerImages + publishDockerImages", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default return values that the per-test code may rely on.
    vi.mocked(docker.remoteImageExists).mockReturnValue(false);
    vi.mocked(docker.localImageExists).mockReturnValue(true);
    vi.mocked(docker.getImageHash).mockReturnValue("deadbeef0123");
    vi.mocked(docker.getImageEntrypoint).mockReturnValue([]);

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pub-docker-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("python autogen: one build, one push, no duplicate from virtual entrypoint", () => {
    const root = makePackageRoot(
      tempDir,
      {
        name: "@test/python-autogen",
        version: "1.0.0",
        "block-software": { entrypoints: { main: pythonEntrypoint } },
      },
      { requirementsTxt: true, runenv: { ref: RUNENV_REF, pythonVersion: "3.12.10" } },
    );

    const core = new Core(mockLogger, { packageRoot: root });
    core.buildDockerImages({ registry: "test.local/repo" });
    core.publishDockerImages();

    expect(docker.build).toHaveBeenCalledTimes(1);
    expect(docker.push).toHaveBeenCalledTimes(1);

    const pushed = vi.mocked(docker.push).mock.calls[0][0];
    expect(pushed).toBe(
      "test.local/repo:test.python-autogen.main.deadbeef0123",
    );
  });

  it("multi-entrypoint python: one build + one push per entrypoint, no overlap", () => {
    const root = makePackageRoot(
      tempDir,
      {
        name: "@test/multi-ep",
        version: "1.0.0",
        "block-software": {
          entrypoints: {
            main: pythonEntrypoint,
            helper: pythonEntrypoint,
          },
        },
      },
      { requirementsTxt: true, runenv: { ref: RUNENV_REF, pythonVersion: "3.12.10" } },
    );

    const core = new Core(mockLogger, { packageRoot: root });
    core.buildDockerImages({ registry: "test.local/repo" });
    core.publishDockerImages();

    expect(docker.build).toHaveBeenCalledTimes(2);
    expect(docker.push).toHaveBeenCalledTimes(2);

    const pushedTags = vi.mocked(docker.push).mock.calls.map((c) => c[0]);
    expect(new Set(pushedTags).size).toBe(2);
    expect(pushedTags).toEqual(
      expect.arrayContaining([
        "test.local/repo:test.multi-ep.main.deadbeef0123",
        "test.local/repo:test.multi-ep.helper.deadbeef0123",
      ]),
    );
  });

  it("java-only: no docker work — type is not in dockerAutogenTypes", () => {
    const root = makePackageRoot(tempDir, {
      name: "@test/java-only",
      version: "1.0.0",
      "block-software": { entrypoints: { main: javaEntrypoint } },
    });

    const core = new Core(mockLogger, { packageRoot: root });
    core.buildDockerImages({ registry: "test.local/repo" });
    core.publishDockerImages();

    expect(docker.build).not.toHaveBeenCalled();
    expect(docker.push).not.toHaveBeenCalled();
  });

  it("explicit docker entrypoint: one build, one push", () => {
    const root = makePackageRoot(
      tempDir,
      {
        name: "@test/explicit-docker",
        version: "1.0.0",
        "block-software": { entrypoints: { main: explicitDockerEntrypoint } },
      },
      { dockerContext: "docker-context" },
    );

    const core = new Core(mockLogger, { packageRoot: root });
    core.buildDockerImages({ registry: "test.local/repo" });
    core.publishDockerImages();

    expect(docker.build).toHaveBeenCalledTimes(1);
    expect(docker.push).toHaveBeenCalledTimes(1);
  });

  it("remoteImageExists short-circuits push (idempotent rebuild)", () => {
    vi.mocked(docker.remoteImageExists).mockReturnValue(true);

    const root = makePackageRoot(
      tempDir,
      {
        name: "@test/python-cached",
        version: "1.0.0",
        "block-software": { entrypoints: { main: pythonEntrypoint } },
      },
      { requirementsTxt: true, runenv: { ref: RUNENV_REF, pythonVersion: "3.12.10" } },
    );

    const core = new Core(mockLogger, { packageRoot: root });
    core.buildDockerImages({ registry: "test.local/repo" });
    core.publishDockerImages();

    expect(docker.build).toHaveBeenCalledTimes(1);
    expect(docker.push).not.toHaveBeenCalled();
  });

  it("strictPlatformMatching skips both build and publish on non-linux/x64 host", () => {
    const currentOS = vi.spyOn(util, "currentOS");
    const currentArch = vi.spyOn(util, "currentArch");
    currentOS.mockReturnValue("macosx");
    currentArch.mockReturnValue("aarch64");

    try {
      const root = makePackageRoot(
        tempDir,
        {
          name: "@test/strict-skipped",
          version: "1.0.0",
          "block-software": { entrypoints: { main: pythonEntrypoint } },
        },
        { requirementsTxt: true, runenv: { ref: RUNENV_REF, pythonVersion: "3.12.10" } },
      );

      const core = new Core(mockLogger, { packageRoot: root });
      core.buildDockerImages({ registry: "test.local/repo", strictPlatformMatching: true });
      core.publishDockerImages({ strictPlatformMatching: true });

      expect(docker.build).not.toHaveBeenCalled();
      expect(docker.push).not.toHaveBeenCalled();
    } finally {
      currentOS.mockRestore();
      currentArch.mockRestore();
    }
  });
});
