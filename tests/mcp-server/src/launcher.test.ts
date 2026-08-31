import { afterEach, beforeEach, expect, test } from "vitest";
import { PlMcpServer } from "@milaboratories/pl-mcp-server";
import type { McpSecret } from "@milaboratories/pl-mcp-server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const pluginRoot = resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "lib",
  "node",
  "pl-mcp-server",
  "claude-plugin",
);

let root: string;
let discoveryFilePath: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "launcher-e2e-"));
  discoveryFilePath = join(root, "mcp-server.json");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function newSecret(): McpSecret {
  return randomUUID().replace(/-/g, "") as McpSecret;
}

/** The command the plugin actually declares, with the plugin-root placeholder resolved. */
function declaredEntry(): { command: string; args: string[] } {
  const declared = JSON.parse(readFileSync(join(pluginRoot, ".mcp.json"), "utf-8")) as {
    pl: { command: string; args: string[] };
  };
  return {
    command: declared.pl.command,
    args: declared.pl.args.map((a) => a.replace("${CLAUDE_PLUGIN_ROOT}", pluginRoot)),
  };
}

async function connectThroughLauncher(): Promise<Client> {
  const { command, args } = declaredEntry();
  const client = new Client({ name: "launcher-test-client", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command, args: [...args, discoveryFilePath] }));
  return client;
}

async function publishedUrl(): Promise<string> {
  const { url } = JSON.parse(await readFile(discoveryFilePath, "utf-8")) as { url: string };
  return url;
}

test("a client reaches the server through the declared entry", { timeout: 30_000 }, async () => {
  const server = new PlMcpServer({ port: 0, secret: newSecret(), discoveryFilePath });
  await server.start();
  const client = await connectThroughLauncher();
  try {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("ping");

    const result = (await client.callTool({ name: "ping", arguments: {} })) as {
      content: { text: string }[];
    };
    expect(JSON.parse(result.content[0].text)).toEqual({ status: "ok", connected: false });
  } finally {
    await client.close();
    await server.stop();
  }
});

test(
  "a retried port is still reached, because the file carries it",
  { timeout: 30_000 },
  async () => {
    const occupant: Server = createServer();
    await new Promise<void>((r) => occupant.listen(0, "127.0.0.1", () => r()));
    const taken = (occupant.address() as { port: number }).port;

    const server = new PlMcpServer({ port: taken, secret: newSecret(), discoveryFilePath });
    await server.start();
    const client = await connectThroughLauncher();
    try {
      expect(new URL(await publishedUrl()).port).toBe(String(taken + 1));
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain("ping");
    } finally {
      await client.close();
      await server.stop();
      await new Promise<void>((r) => occupant.close(() => r()));
    }
  },
);

test("a restart on a different port needs no reconfiguration", { timeout: 30_000 }, async () => {
  const first = new PlMcpServer({ port: 0, secret: newSecret(), discoveryFilePath });
  await first.start();
  const firstUrl = await publishedUrl();
  await first.stop();

  const second = new PlMcpServer({ port: 0, secret: newSecret(), discoveryFilePath });
  await second.start();
  expect(await publishedUrl()).not.toBe(firstUrl);

  const client = await connectThroughLauncher();
  try {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("ping");
  } finally {
    await client.close();
    await second.stop();
  }
});

test("an address nothing listens on fails to connect", { timeout: 30_000 }, async () => {
  await writeFile(discoveryFilePath, JSON.stringify({ url: "http://127.0.0.1:1/none/mcp" }));
  await expect(connectThroughLauncher()).rejects.toThrow(/closed|exited|spawn|connect/i);
});

test("a missing discovery file fails to connect", { timeout: 30_000 }, async () => {
  await expect(connectThroughLauncher()).rejects.toThrow(/closed|exited|spawn|connect/i);
});
