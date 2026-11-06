import { test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { MiLogger } from "@milaboratories/ts-helpers";
import { LocalPl } from "./pl";

const secret = "fedcba9876543210fedcba9876543210";

class RecordingLogger implements MiLogger {
  public readonly lines: string[] = [];
  info(msg: unknown) {
    this.lines.push(String(msg));
  }
  warn(msg: unknown) {
    this.lines.push(String(msg));
  }
  error(msg: unknown) {
    this.lines.push(String(msg));
  }
}

/** What `localPlatformaInit` records before creating LocalPl: start options with proxy and env. */
const startHistory = {
  startOptions: {
    proxy: { url: `http://u:${secret}@proxy:3128`, auth: `u:${secret}` },
    spawnOptions: { env: { HTTPS_PROXY: `http://u:${secret}@proxy:3128`, PL_TOKEN: secret } },
  },
};

let workDir: string;
beforeEach(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "pl-redaction-"));
});
afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

test("LocalPl close handler logs debug info without credentials", async () => {
  const logger = new RecordingLogger();
  const closed = Promise.withResolvers<void>();
  const pl = new LocalPl(
    logger,
    workDir,
    { cmd: process.execPath, args: ["-e", ""], opts: { cwd: workDir } },
    startHistory,
    undefined,
    async () => closed.resolve(),
  );

  await pl.start();
  await closed.promise;

  const line = logger.lines.find((l) => l.startsWith("platforma was closed"));
  expect(line).toContain("http://u:***@proxy:3128");
  expect(logger.lines.join("\n")).not.toContain(secret);
});

test("LocalPl error handler logs debug info without credentials", async () => {
  const logger = new RecordingLogger();
  const failed = Promise.withResolvers<void>();
  const pl = new LocalPl(
    logger,
    workDir,
    { cmd: path.join(workDir, "no-such-binary"), args: [], opts: { cwd: workDir } },
    startHistory,
    undefined,
    undefined,
    async () => failed.resolve(),
  );

  await expect(pl.start()).rejects.toThrow();
  await failed.promise;

  const line = logger.lines.find((l) => l.includes("while running platforma"));
  expect(line).toContain("http://u:***@proxy:3128");
  expect(logger.lines.join("\n")).not.toContain(secret);
});
