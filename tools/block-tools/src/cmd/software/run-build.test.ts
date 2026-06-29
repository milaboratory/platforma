import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runBuild } from "./run-build";
import { parseScenario, type Knobs } from "./knobs";
import { defaults, type Builder } from "@platforma-sdk/package-builder-lib";

// A Builder stub that records which engine methods ran, in order.
function fakeBuilder() {
  const calls: string[] = [];
  const rec = (name: string) => (_opts?: unknown) => {
    calls.push(name);
  };
  const core = {
    buildMode: "release",
    isPrivate: false,
    buildDockerImages: vi.fn(rec("buildDockerImages")),
    writePublishedArtifactInfo: vi.fn(rec("writePublishedArtifactInfo")),
    buildSoftwareArchives: vi.fn(async () => void calls.push("buildSoftwareArchives")),
    publishDockerImages: vi.fn(rec("publishDockerImages")),
    publishPackages: vi.fn(async () => void calls.push("publishPackages")),
    buildSwJsonFiles: vi.fn(rec("buildSwJsonFiles")),
  };
  return { core: core as unknown as Builder, calls, spies: core };
}

const run = (knobs: Knobs, b = fakeBuilder()) =>
  runBuild(b.core, parseScenario(knobs), {}).then(() => b);

afterEach(() => {
  for (const k of [
    "CI",
    "PL_DEV_DOCKER_PUSH_URL",
    "PL_DEV_DOCKER_PULL_URL",
    "PL_RELEASE_DOCKER_PUSH_URL",
    "PL_RELEASE_DOCKER_PULL_URL",
  ]) {
    delete process.env[k];
  }
});

// What registry/pushTo the engine was called with for a docker target.
async function dockerAddresses(knobs: Knobs) {
  const b = await run(knobs);
  const reg = (fn: { mock: { calls: unknown[][] } }) =>
    (fn.mock.calls[0]?.[0] as { registry?: string; pushTo?: string }) ?? {};
  return {
    pull: reg(b.spies.buildDockerImages).registry,
    push: reg(b.spies.publishDockerImages).pushTo,
  };
}

describe("runBuild orchestration", () => {
  it("always writes the descriptor last", async () => {
    for (const knobs of [
      {},
      { channel: "dev", variant: "binary", location: "local" },
      { channel: "dev", variant: "binary", location: "remote" },
      { channel: "release", location: "remote" },
      { usePublished: true },
    ] as Knobs[]) {
      const { calls } = await run(knobs);
      expect(calls.at(-1)).toBe("buildSwJsonFiles");
    }
  });

  it("dev-binary-remote builds then uploads the binary, no docker", async () => {
    const { calls } = await run({ channel: "dev", variant: "binary", location: "remote" });
    expect(calls).toEqual(["buildSoftwareArchives", "publishPackages", "buildSwJsonFiles"]);
  });

  it("dev-binary-local builds the binary but does not upload", async () => {
    const { calls } = await run({ channel: "dev", variant: "binary", location: "local" });
    expect(calls).toEqual(["buildSoftwareArchives", "buildSwJsonFiles"]);
  });

  it("use-published writes the descriptor only — no build, no push", async () => {
    const { calls } = await run({ usePublished: true });
    expect(calls).toEqual(["writePublishedArtifactInfo", "buildSwJsonFiles"]);
  });

  it("sets the scenario-derived build mode on the engine", async () => {
    expect((await run({})).core.buildMode).toBe("release");
    expect(
      (await run({ channel: "dev", variant: "binary", location: "local" })).core.buildMode,
    ).toBe("dev-local");
    expect(
      (await run({ channel: "dev", variant: "binary", location: "remote" })).core.buildMode,
    ).toBe("dev-remote");
    expect((await run({ usePublished: true })).core.buildMode).toBe("release");
  });

  it("dev-docker-remote pushes docker (push before descriptor)", async () => {
    const { calls } = await run({ channel: "dev", variant: "docker", location: "remote" });
    expect(calls).toEqual(["buildDockerImages", "publishDockerImages", "buildSwJsonFiles"]);
  });

  it("docker-local builds docker but does not push", async () => {
    const { calls } = await run({ channel: "dev", variant: "docker", location: "local" });
    expect(calls).toEqual(["buildDockerImages", "buildSwJsonFiles"]);
  });

  it("no variant builds both kinds; local => no push", async () => {
    const { calls } = await run({ channel: "dev", location: "local" });
    expect(calls).toEqual(["buildDockerImages", "buildSoftwareArchives", "buildSwJsonFiles"]);
  });

  it("release + remote builds and pushes both kinds in one pass, descriptor last", async () => {
    const { calls } = await run({ channel: "release", location: "remote" });
    expect(calls).toEqual([
      "buildDockerImages",
      "buildSoftwareArchives",
      "publishDockerImages",
      "publishPackages",
      "buildSwJsonFiles",
    ]);
  });

  it("dev docker build targets the built-in dev registry; release does not", async () => {
    const dev = await run({ channel: "dev", variant: "docker", location: "remote" });
    expect(dev.spies.buildDockerImages).toHaveBeenCalledWith(
      expect.objectContaining({ registry: defaults.DEV_DOCKER_REGISTRY }),
    );
    const rel = await run({ channel: "release", variant: "docker", location: "remote" });
    expect(rel.spies.buildDockerImages).toHaveBeenCalledWith(
      expect.objectContaining({ registry: undefined }),
    );
  });

  describe("docker channel address overrides", () => {
    const devRemote: Knobs = { channel: "dev", variant: "docker", location: "remote" };
    const releaseRemote: Knobs = { channel: "release", variant: "docker", location: "remote" };

    it("dev defaults: push and embedded pull both target the built-in dev registry", async () => {
      expect(await dockerAddresses(devRemote)).toEqual({
        pull: defaults.DEV_DOCKER_REGISTRY,
        push: defaults.DEV_DOCKER_REGISTRY,
      });
    });

    it("dev PUSH override: pull follows push when no pull override is set", async () => {
      process.env.PL_DEV_DOCKER_PUSH_URL = "ecr.example/dev";
      expect(await dockerAddresses(devRemote)).toEqual({
        pull: "ecr.example/dev",
        push: "ecr.example/dev",
      });
    });

    it("dev PUSH + PULL overrides are independent (push there, embed this)", async () => {
      process.env.PL_DEV_DOCKER_PUSH_URL = "ecr.example/dev";
      process.env.PL_DEV_DOCKER_PULL_URL = "cdn.example/dev";
      expect(await dockerAddresses(devRemote)).toEqual({
        pull: "cdn.example/dev",
        push: "ecr.example/dev",
      });
    });

    it("release override targets the configured release registry, no built-in default", async () => {
      expect(await dockerAddresses(releaseRemote)).toEqual({ pull: undefined, push: undefined });
      process.env.PL_RELEASE_DOCKER_PUSH_URL = "quay.io/org/repo";
      expect(await dockerAddresses(releaseRemote)).toEqual({
        pull: "quay.io/org/repo",
        push: "quay.io/org/repo",
      });
    });

    it("legacy (pl-pkg parity) ignores channel overrides", async () => {
      process.env.CI = "true";
      process.env.PL_RELEASE_DOCKER_PUSH_URL = "quay.io/org/repo";
      // bare invocation: docker addresses stay unset (engine pushes to the embedded tag).
      expect(await dockerAddresses({})).toEqual({ pull: undefined, push: undefined });
    });

    it("explicit --docker-push-to wins over the channel override", async () => {
      process.env.PL_DEV_DOCKER_PUSH_URL = "ecr.example/dev";
      const b = await run(devRemote);
      await runBuild(b.core, parseScenario(devRemote), { dockerPushTo: "flag.example/repo" });
      const lastPush = b.spies.publishDockerImages.mock.calls.at(-1)?.[0] as { pushTo?: string };
      expect(lastPush.pushTo).toBe("flag.example/repo");
    });
  });

  describe("legacy (no knobs) defers docker to the CI default", () => {
    it("outside CI: build binary only, no docker, no push", async () => {
      delete process.env.CI;
      const { calls } = await run({});
      expect(calls).toEqual(["buildSoftwareArchives", "buildSwJsonFiles"]);
    });

    it("in CI: builds and pushes docker too", async () => {
      process.env.CI = "true";
      const { calls } = await run({});
      expect(calls).toEqual([
        "buildDockerImages",
        "buildSoftwareArchives",
        "publishDockerImages",
        "buildSwJsonFiles",
      ]);
    });
  });
});

describe("runBuild option pass-through", () => {
  let b: ReturnType<typeof fakeBuilder>;
  beforeEach(() => (b = fakeBuilder()));

  it("forwards package ids and storage URL to the engine", async () => {
    await runBuild(
      b.core,
      parseScenario({ channel: "dev", variant: "binary", location: "remote" }),
      {
        ids: ["pkg-a"],
        storageUrl: "s3://bucket/dev",
      },
    );
    expect(b.spies.buildSoftwareArchives).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ["pkg-a"], skipIfEmpty: false }),
    );
    expect(b.spies.publishPackages).toHaveBeenCalledWith({
      ids: ["pkg-a"],
      storageURL: "s3://bucket/dev",
    });
  });

  it("--docker-no-build wins over the CI default in legacy mode", async () => {
    process.env.CI = "true";
    await runBuild(b.core, parseScenario({}), { dockerNoBuild: true });
    expect(b.spies.buildDockerImages).not.toHaveBeenCalled();
    expect(b.calls).toEqual(["buildSoftwareArchives", "buildSwJsonFiles"]);
  });
});
