import { describe, it, expect, afterEach, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("node:child_process", () => ({ spawnSync: spawnMock }));

const docker = await import("../docker");

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function runBuild() {
  spawnMock.mockReturnValue({ status: 0 });
  docker.build("/ctx", "/ctx/Dockerfile", "local:tag", "pkg/main", "1.0.0");
  expect(spawnMock).toHaveBeenCalledTimes(1);
  const [cmd, args, opts] = spawnMock.mock.calls[0] as [
    string,
    string[],
    { env: NodeJS.ProcessEnv },
  ];
  return { cmd, args, env: opts.env };
}

describe("docker.build", () => {
  it("passes no buildx-only attestation flags, so podman accepts the command", () => {
    const { cmd, args } = runBuild();
    expect(cmd).toBe("docker");
    expect(args[0]).toBe("build");
    expect(args.some((a) => a.startsWith("--provenance") || a.startsWith("--sbom"))).toBe(false);
  });

  it("disables buildx default attestations through the environment", () => {
    const { env } = runBuild();
    expect(env.BUILDX_NO_DEFAULT_ATTESTATIONS).toBe("1");
  });

  it("overrides a user value that would enable default attestations", () => {
    vi.stubEnv("BUILDX_NO_DEFAULT_ATTESTATIONS", "0");
    const { env } = runBuild();
    expect(env.BUILDX_NO_DEFAULT_ATTESTATIONS).toBe("1");
  });

  it("pins the build platform", () => {
    const { args } = runBuild();
    expect(args.slice(args.indexOf("--platform"), args.indexOf("--platform") + 2)).toEqual([
      "--platform",
      "linux/amd64",
    ]);
  });
});
