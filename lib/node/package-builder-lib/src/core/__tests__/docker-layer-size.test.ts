import { describe, it, expect, afterEach, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("node:child_process", () => ({ spawnSync: spawnMock }));

const docker = await import("../docker");

const GiB = 1024 ** 3;

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function mockHistory(lines: string[]) {
  spawnMock.mockReturnValue({ status: 0, stdout: lines.join("\n") + "\n" });
}

describe("parseImageHistory", () => {
  it("reads byte sizes and instructions, newest first", () => {
    expect(
      docker.parseImageHistory(
        `0\tCMD ["bash"]\n8589934592\tRUN /bin/sh -c pip install -r req.txt\n\n`,
      ),
    ).toEqual([
      { bytes: 0, createdBy: 'CMD ["bash"]' },
      { bytes: 8589934592, createdBy: "RUN /bin/sh -c pip install -r req.txt" },
    ]);
  });

  it("treats an unparsable size as 0", () => {
    expect(docker.parseImageHistory("N/A\tADD file")).toEqual([
      { bytes: 0, createdBy: "ADD file" },
    ]);
  });
});

describe("checkLayerSizes", () => {
  it("asks docker history for raw byte sizes", () => {
    mockHistory(["0\tCMD"]);
    docker.checkLayerSizes("local:tag", vi.fn());
    const [cmd, args] = spawnMock.mock.calls[0] as [string, string[]];
    expect(cmd).toBe("docker");
    expect(args).toEqual([
      "history",
      "--no-trunc",
      "--human=false",
      "--format",
      "{{.Size}}\t{{.CreatedBy}}",
      "local:tag",
    ]);
  });

  it("is silent when every layer is under the default limit", () => {
    mockHistory([`${GiB}\tRUN a`, `${3 * GiB}\tRUN b`]);
    const warn = vi.fn();
    docker.checkLayerSizes("local:tag", warn);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns, without failing, about a layer above the default limit", () => {
    mockHistory([`${GiB}\tRUN a`, `${8 * GiB}\tRUN pip install`]);
    const warn = vi.fn();
    docker.checkLayerSizes("local:tag", warn);
    expect(warn).toHaveBeenCalledOnce();
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain("1 layer(s) above 4.00 GiB");
    expect(message).toContain("8.00 GiB  RUN pip install");
  });

  it("fails when PL_DOCKER_MAX_LAYER_BYTES is set and a layer exceeds it", () => {
    vi.stubEnv("PL_DOCKER_MAX_LAYER_BYTES", String(2 * GiB));
    mockHistory([`${3 * GiB}\tRUN big`]);
    const warn = vi.fn();
    expect(() => docker.checkLayerSizes("local:tag", warn)).toThrow(/above 2.00 GiB/);
    expect(warn).not.toHaveBeenCalled();
  });

  it("passes when PL_DOCKER_MAX_LAYER_BYTES is set and layers fit", () => {
    vi.stubEnv("PL_DOCKER_MAX_LAYER_BYTES", String(10 * GiB));
    mockHistory([`${8 * GiB}\tRUN big`]);
    expect(() => docker.checkLayerSizes("local:tag", vi.fn())).not.toThrow();
  });

  it("rejects a non-numeric PL_DOCKER_MAX_LAYER_BYTES", () => {
    vi.stubEnv("PL_DOCKER_MAX_LAYER_BYTES", "4G");
    expect(() => docker.checkLayerSizes("local:tag", vi.fn())).toThrow(
      /must be a positive number of bytes/,
    );
  });

  it("warns, without failing, when docker history fails", () => {
    spawnMock.mockReturnValue({ status: 1, stdout: "" });
    const warn = vi.fn();
    expect(() => docker.checkLayerSizes("local:tag", warn)).not.toThrow();
    expect(String(warn.mock.calls[0]?.[0])).toContain("Could not check layer sizes");
  });

  it("fails when docker history fails and the limit is enforced", () => {
    vi.stubEnv("PL_DOCKER_MAX_LAYER_BYTES", String(GiB));
    spawnMock.mockReturnValue({ status: 1, stdout: "" });
    expect(() => docker.checkLayerSizes("local:tag", vi.fn())).toThrow(/docker history/);
  });
});
