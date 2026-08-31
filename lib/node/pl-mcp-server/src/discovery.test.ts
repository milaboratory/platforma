import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { DiscoveryFile, mcpDiscoveryFilePath } from "./discovery";

describe("mcpDiscoveryFilePath", () => {
  it("returns an absolute path under the home directory", () => {
    const path = mcpDiscoveryFilePath();
    expect(isAbsolute(path)).toBe(true);
    expect(path.startsWith(homedir())).toBe(true);
  });
});

describe("DiscoveryFile", () => {
  let root: string;
  let filePath: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mcp-discovery-"));
    filePath = join(root, "nested", "mcp-server.json");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("creates a missing parent directory and the file", async () => {
    await new DiscoveryFile(filePath).publish("http://127.0.0.1:4200/abc/mcp");
    expect(existsSync(filePath)).toBe(true);
  });

  it("writes JSON whose url is the published address", async () => {
    const url = "http://127.0.0.1:4200/abc/mcp";
    await new DiscoveryFile(filePath).publish(url);
    expect(JSON.parse(await readFile(filePath, "utf-8"))).toEqual({ url });
  });

  it("leaves one object holding the second address when published twice", async () => {
    const file = new DiscoveryFile(filePath);
    await file.publish("http://127.0.0.1:4200/first/mcp");
    await file.publish("http://127.0.0.1:4300/second/mcp");
    expect(JSON.parse(await readFile(filePath, "utf-8"))).toEqual({
      url: "http://127.0.0.1:4300/second/mcp",
    });
  });

  it("grants group and other no access to the published file", async () => {
    await new DiscoveryFile(filePath).publish("http://127.0.0.1:4200/abc/mcp");
    expect((await stat(filePath)).mode & 0o077).toBe(0);
  });

  it("removes a file that was never published without an error", async () => {
    await expect(new DiscoveryFile(filePath).remove()).resolves.toBeUndefined();
  });

  it("leaves the path absent after removing a published file", async () => {
    const file = new DiscoveryFile(filePath);
    await file.publish("http://127.0.0.1:4200/abc/mcp");
    await file.remove();
    expect(existsSync(filePath)).toBe(false);
  });
});
