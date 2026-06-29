import { test, expect } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import fsp from "node:fs/promises";
import { publishCommand } from "./publish";

function option(cmd: ReturnType<typeof publishCommand>, long: string) {
  return cmd.options.find((o) => o.long === long);
}

test("publish keeps --registry required and adds a required --registry-serve-url", () => {
  const cmd = publishCommand();
  expect(option(cmd, "--registry")?.mandatory).toBe(true);
  expect(option(cmd, "--registry-serve-url")?.mandatory).toBe(true);
});

test("publish errors when the serve URL is absent", async () => {
  // A real manifest file so the action's read never runs — parsing must reject
  // on the missing required --registry-serve-url before any registry I/O.
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "publish-flags-"));
  const manifestPath = path.join(dir, "manifest.json");
  await fsp.writeFile(manifestPath, "{}");

  // Clear the env binding so the mandatory check, not the environment, decides.
  const prev = process.env.PL_REGISTRY_SERVE_URL;
  delete process.env.PL_REGISTRY_SERVE_URL;
  try {
    const cmd = publishCommand().exitOverride();
    await expect(
      cmd.parseAsync(["-r", "s3://bucket", "-m", manifestPath], { from: "user" }),
    ).rejects.toThrow(/registry-serve-url/i);
  } finally {
    if (prev !== undefined) process.env.PL_REGISTRY_SERVE_URL = prev;
  }
});
