import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runBuild } from "./run-build";
import { parseScenario, type Knobs } from "./knobs";
import { defaults, type Builder } from "@platforma-sdk/package-builder-lib";
import { ensureEcrLogin, ensureAwsProfile } from "./ecr-login";

// Neutralize the real docker/aws shelling; assert only that the orchestration calls it.
vi.mock("./ecr-login", () => ({ ensureEcrLogin: vi.fn(), ensureAwsProfile: vi.fn() }));

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
  runBuild({ core: b.core, scenario: parseScenario(knobs) }).then(() => b);

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
  vi.clearAllMocks();
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

  it("no-software writes a placeholder descriptor only — no build, no push", async () => {
    const b = await run({ channel: "dev", variant: "none", location: "local" });
    expect(b.calls).toEqual(["buildSwJsonFiles"]);
    expect(b.spies.buildSwJsonFiles).toHaveBeenCalledWith(
      expect.objectContaining({ noSoftware: true }),
    );
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

  it("dev docker build targets the built-in dev registry; release the production registry", async () => {
    const dev = await run({ channel: "dev", variant: "docker", location: "remote" });
    expect(dev.spies.buildDockerImages).toHaveBeenCalledWith(
      expect.objectContaining({ registry: defaults.DEV_DOCKER_REGISTRY }),
    );
    const rel = await run({ channel: "release", variant: "docker", location: "remote" });
    expect(rel.spies.buildDockerImages).toHaveBeenCalledWith(
      expect.objectContaining({ registry: defaults.DOCKER_REGISTRY }),
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

    it("release pull defaults to the built-in registry, independent of the push target", async () => {
      // No push override: nothing pushed, pull embeds the built-in production registry.
      expect(await dockerAddresses(releaseRemote)).toEqual({
        pull: defaults.DOCKER_REGISTRY,
        push: undefined,
      });
      // Push to quay, but the descriptor still embeds containers.pl-open.science (GA-fronted proxy).
      // quay is not reachable from corporate deployments, so pull must NOT inherit the push target.
      process.env.PL_RELEASE_DOCKER_PUSH_URL = "quay.io/org/repo";
      expect(await dockerAddresses(releaseRemote)).toEqual({
        pull: defaults.DOCKER_REGISTRY,
        push: "quay.io/org/repo",
      });
    });

    it("PL_RELEASE_DOCKER_PULL_URL overrides the built-in release pull default", async () => {
      process.env.PL_RELEASE_DOCKER_PUSH_URL = "quay.io/org/repo";
      process.env.PL_RELEASE_DOCKER_PULL_URL = "cdn.example/release";
      expect(await dockerAddresses(releaseRemote)).toEqual({
        pull: "cdn.example/release",
        push: "quay.io/org/repo",
      });
    });

    it("bare (pl-pkg parity) ignores channel overrides", async () => {
      process.env.CI = "true";
      process.env.PL_RELEASE_DOCKER_PUSH_URL = "quay.io/org/repo";
      // bare invocation: docker addresses stay unset (engine pushes to the embedded tag).
      expect(await dockerAddresses({})).toEqual({ pull: undefined, push: undefined });
    });

    it("dev default (ecr:// push target) auto-logs-in for the stripped host", async () => {
      await run(devRemote);
      expect(ensureEcrLogin).toHaveBeenCalledWith(defaults.DEV_DOCKER_REGISTRY, undefined);
      expect(ensureAwsProfile).toHaveBeenCalled();
    });

    it("a plain (non-ecr) push override opts out of auto-login", async () => {
      process.env.PL_DEV_DOCKER_PUSH_URL = "ecr.example/dev";
      await run(devRemote);
      expect(ensureEcrLogin).not.toHaveBeenCalled();
    });

    it("local docker build never logs in", async () => {
      await run({ channel: "dev", variant: "docker", location: "local" });
      expect(ensureEcrLogin).not.toHaveBeenCalled();
    });

    it("explicit --docker-push-to wins over the channel override", async () => {
      process.env.PL_DEV_DOCKER_PUSH_URL = "ecr.example/dev";
      const b = await run(devRemote);
      await runBuild({
        core: b.core,
        scenario: parseScenario(devRemote),
        options: { dockerPushTo: "flag.example/repo" },
      });
      const lastPush = b.spies.publishDockerImages.mock.calls.at(-1)?.[0] as { pushTo?: string };
      expect(lastPush.pushTo).toBe("flag.example/repo");
    });
  });

  describe("bare honors the resolved docker decisions (resolution lives in build.ts)", () => {
    it("buildDocker=false: binary only, no docker", async () => {
      const b = fakeBuilder();
      await runBuild({
        core: b.core,
        scenario: parseScenario({}),
        options: { buildDocker: false },
      });
      expect(b.calls).toEqual(["buildSoftwareArchives", "buildSwJsonFiles"]);
    });

    it("buildDocker + pushDocker: build then push docker around the binary", async () => {
      const b = fakeBuilder();
      await runBuild({
        core: b.core,
        scenario: parseScenario({}),
        options: { buildDocker: true, pushDocker: true },
      });
      expect(b.calls).toEqual([
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
    await runBuild({
      core: b.core,
      scenario: parseScenario({ channel: "dev", variant: "binary", location: "remote" }),
      options: { ids: ["pkg-a"], storageUrl: "s3://bucket/dev" },
    });
    expect(b.spies.buildSoftwareArchives).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ["pkg-a"], skipIfEmpty: false }),
    );
    expect(b.spies.publishPackages).toHaveBeenCalledWith({
      ids: ["pkg-a"],
      storageURL: "s3://bucket/dev",
    });
  });
});

// The core safety invariant: "ready ⟺ the descriptor exists". A failed build or push must leave no
// descriptor, so nothing downstream ever sees a broken half-build.
describe("descriptor-last: not written when a step fails", () => {
  it("skips the descriptor when the binary build throws", async () => {
    const b = fakeBuilder();
    b.spies.buildSoftwareArchives.mockRejectedValueOnce(new Error("build boom"));
    await expect(
      runBuild({
        core: b.core,
        scenario: parseScenario({ channel: "dev", variant: "binary", location: "remote" }),
      }),
    ).rejects.toThrow("build boom");
    expect(b.spies.buildSwJsonFiles).not.toHaveBeenCalled();
  });

  it("skips the descriptor when the docker push throws", async () => {
    const b = fakeBuilder();
    b.spies.publishDockerImages.mockImplementationOnce(() => {
      throw new Error("push boom");
    });
    await expect(
      runBuild({
        core: b.core,
        scenario: parseScenario({ channel: "dev", variant: "docker", location: "remote" }),
      }),
    ).rejects.toThrow("push boom");
    expect(b.spies.buildSwJsonFiles).not.toHaveBeenCalled();
  });
});
