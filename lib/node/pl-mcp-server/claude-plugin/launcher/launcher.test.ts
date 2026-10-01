import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mcpDiscoveryFilePath } from "../../src/discovery";
import { defaultDiscoveryFilePath } from "./platforma-mcp-launcher.mjs";

const pluginRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(import.meta.dirname, "..", "..", "..", "..", "..");
const launcher = join(pluginRoot, "launcher", "platforma-mcp-launcher.mjs");

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function runLauncher(
  discoveryPath: string,
): Promise<{ code: number | null; stderr: string; stdoutText: string }> {
  return new Promise((resolveRun) => {
    const child = execFile(
      process.execPath,
      [launcher, discoveryPath],
      (_err, stdoutText, stderr) => {
        resolveRun({ code: child.exitCode, stderr, stdoutText });
      },
    );
    child.stdin?.end();
  });
}

describe("the declared plugin bundle", () => {
  it("names a launcher file that exists", () => {
    const declared = readJson(join(pluginRoot, ".mcp.json")) as {
      pl: { command: string; args: string[] };
    };
    const entry = declared.pl.args[0].replace("${CLAUDE_PLUGIN_ROOT}", pluginRoot);
    expect(declared.pl.command).toBe("node");
    expect(existsSync(entry)).toBe(true);
  });

  it("agrees with the marketplace manifest on the name and the directory", () => {
    const plugin = readJson(join(pluginRoot, ".claude-plugin", "plugin.json")) as { name: string };
    const marketplace = readJson(join(repoRoot, ".claude-plugin", "marketplace.json")) as {
      plugins: { name: string; source: { "plugin-dir": string } }[];
    };

    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0].name).toBe(plugin.name);
    expect(resolve(repoRoot, marketplace.plugins[0].source["plugin-dir"])).toBe(pluginRoot);
  });
});

describe("the launcher's default path", () => {
  it("equals the path the server package exports", () => {
    expect(defaultDiscoveryFilePath()).toBe(mcpDiscoveryFilePath());
  });
});

describe("the launcher refuses to start", () => {
  let root: string;
  let discoveryPath: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "launcher-test-"));
    discoveryPath = join(root, "mcp-server.json");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("names the absent file and reads no stdin", async () => {
    const { code, stderr, stdoutText } = await runLauncher(discoveryPath);
    expect(code).not.toBe(0);
    expect(stderr).toContain(discoveryPath);
    expect(stderr).toMatch(/no published address/);
    expect(stdoutText).toBe("");
  });

  it("reports a file that carries no address", async () => {
    await writeFile(discoveryPath, JSON.stringify({ note: "no url here" }));
    const { code, stderr } = await runLauncher(discoveryPath);
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/carries no address/);
  });

  it("reports an address nothing listens on", async () => {
    await writeFile(discoveryPath, JSON.stringify({ url: "http://127.0.0.1:1/none/mcp" }));
    const { code, stderr } = await runLauncher(discoveryPath);
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/nothing answers/);
  });

  it("leaves the discovery file byte for byte as written", async () => {
    const written = JSON.stringify({ url: "http://127.0.0.1:1/none/mcp" });
    await writeFile(discoveryPath, written);
    await runLauncher(discoveryPath);
    expect(await readFile(discoveryPath, "utf-8")).toBe(written);
  });
});
