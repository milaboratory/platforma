import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import winston from "winston";

// relayerAndPush with every external command faked: checks the order of the steps, what
// each tool gets, the fallback for images chunkah cannot store, and the volume cleanup.

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("node:child_process", () => ({ spawnSync: spawnMock }));

const { relayerAndPush } = await import("../docker-relayer");

type Call = { command: string; args: string[]; options: Record<string, unknown> };

function logger() {
  const log = winston.createLogger({
    transports: [new winston.transports.Console({ silent: true })],
  });
  const warn = vi.spyOn(log, "warn");
  return { log, warn };
}

/** Fakes the docker CLI: answers each command by what it does. */
function fakeDocker(opts: { special?: string[]; failPush?: boolean } = {}): Call[] {
  const calls: Call[] = [];
  spawnMock.mockImplementation(
    (command: string, args: string[], options: Record<string, unknown> = {}) => {
      calls.push({ command, args, options });
      const ok = (stdout = "") => ({ status: 0, stdout, stderr: "" });
      const joined = args.join(" ");
      if (command === "docker" && args[0] === "volume" && args[1] === "ls") return ok("");
      if (command === "docker" && joined.includes("{{.Config.WorkingDir}}")) return ok("/app\n");
      if (command === "docker" && joined.includes("{{.Created}}")) {
        return ok("2026-11-10T12:00:00Z\n");
      }
      if (command === "docker" && args[0] === "image" && args[1] === "inspect") {
        return ok('[{"Config": {}}]');
      }
      if (command === "docker" && args.includes("/r") && args.includes("-")) {
        return ok(`relayer: done\n${JSON.stringify({ special: opts.special ?? [] })}\n`);
      }
      if (command === "docker" && args.at(-1)?.includes("index.json")) {
        return ok(
          JSON.stringify([
            [1000, "pypi/numpy"],
            [10, ""],
          ]),
        );
      }
      if (command === "docker" && args.at(-1)?.includes("crane push") && opts.failPush) {
        return { status: 1, stdout: "", stderr: "" };
      }
      return ok();
    },
  );
  return calls;
}

describe("relayerAndPush", () => {
  let configDir: string;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "relayer-flow-"));
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({ auths: { "quay.io": { auth: "dXNlcjpwdw==" } } }),
    );
    vi.stubEnv("DOCKER_CONFIG", configDir);
    vi.stubEnv("PL_DOCKER_RELAYER", "chunkah");
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  const steps = (calls: Call[]) =>
    calls.map((c) => {
      const a = c.args;
      if (c.command === "bash") return "flatten";
      if (a[0] === "volume") return `volume ${a[1]}`;
      if (a[0] === "image") return "inspect";
      if (a.includes("build")) return "chunkah";
      if (a.at(-1)?.includes("crane push")) return "push";
      if (a.at(-1)?.includes("index.json")) return "manifest";
      if (a.includes("/r")) return "tag";
      return a.join(" ");
    });

  it("flattens, tags, writes layers with chunkah and pushes with crane", () => {
    const calls = fakeDocker();
    const { log } = logger();

    expect(relayerAndPush("local:1", "quay.io/org/img:1", log)).toBe(true);

    expect(steps(calls)).toEqual([
      "volume ls",
      "volume create",
      "volume create",
      "flatten",
      "inspect",
      "tag",
      "inspect",
      "inspect",
      "chunkah",
      "volume rm",
      "manifest",
      "push",
      "volume rm",
    ]);

    const chunkah = calls.find((c) => c.args.includes("build"));
    expect(chunkah?.options.env).toMatchObject({ SOURCE_DATE_EPOCH: "1794312000" });

    const push = calls.find((c) => c.args.at(-1)?.includes("crane push"));
    // credentials only on stdin, keyed by the registry host
    expect(JSON.parse(String(push?.options.input))).toEqual({
      auths: { "quay.io": { auth: "dXNlcjpwdw==" } },
    });
    expect(push?.args.join(" ")).not.toContain("dXNlcjpwdw==");
    expect(push?.options.env).toMatchObject({ PL_PUSH_TAG: "quay.io/org/img:1" });

    // the last call removes both volumes, whatever happened before
    const cleanup = calls.at(-1);
    expect(cleanup?.args.slice(0, 3)).toEqual(["volume", "rm", "-f"]);
    expect(cleanup?.args.slice(3)).toHaveLength(2);
  });

  it("returns false without pushing when the image has special files", () => {
    const calls = fakeDocker({ special: ["/app/pipe"] });
    const { log, warn } = logger();

    expect(relayerAndPush("local:1", "quay.io/org/img:1", log)).toBe(false);

    expect(steps(calls)).not.toContain("chunkah");
    expect(steps(calls)).not.toContain("push");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("/app/pipe"));
    expect(calls.at(-1)?.args.slice(0, 3)).toEqual(["volume", "rm", "-f"]);
  });

  it("fails with a login hint when crane cannot push, and still removes the volumes", () => {
    const calls = fakeDocker({ failPush: true });
    const { log } = logger();

    expect(() => relayerAndPush("local:1", "quay.io/org/img:1", log)).toThrow(
      /docker login quay.io/,
    );
    expect(calls.at(-1)?.args.slice(0, 3)).toEqual(["volume", "rm", "-f"]);
  });
});
