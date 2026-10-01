import { afterEach, beforeEach, expect, test } from "vitest";
import { PlMcpServer } from "@milaboratories/pl-mcp-server";
import type { McpSecret } from "@milaboratories/pl-mcp-server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let root: string;
let discoveryFilePath: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "mcp-discovery-e2e-"));
  discoveryFilePath = join(root, "mcp-server.json");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function newSecret(): McpSecret {
  return randomUUID().replace(/-/g, "") as McpSecret;
}

async function publishedUrl(): Promise<string> {
  const { url } = JSON.parse(await readFile(discoveryFilePath, "utf-8")) as { url: string };
  return url;
}

test("the published address is the server's own url", async () => {
  const server = new PlMcpServer({ port: 0, secret: newSecret(), discoveryFilePath });
  await server.start();
  try {
    expect(await publishedUrl()).toBe(server.url);
  } finally {
    await server.stop();
  }
});

test("a client connecting to the published address lists the ping tool", async () => {
  const server = new PlMcpServer({ port: 0, secret: newSecret(), discoveryFilePath });
  await server.start();
  const client = new Client({ name: "discovery-test-client", version: "1.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(await publishedUrl())));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("ping");
  } finally {
    await client.close();
    await server.stop();
  }
});

test("a busy port publishes the port the listener retried onto", async () => {
  const occupant: Server = createServer();
  await new Promise<void>((resolve) => occupant.listen(0, "127.0.0.1", () => resolve()));
  const taken = (occupant.address() as { port: number }).port;

  const server = new PlMcpServer({ port: taken, secret: newSecret(), discoveryFilePath });
  await server.start();
  try {
    const url = await publishedUrl();
    expect(new URL(url).port).toBe(String(taken + 1));
    expect(url).toBe(server.url);
  } finally {
    await server.stop();
    await new Promise<void>((resolve) => occupant.close(() => resolve()));
  }
});

test("stopping the server leaves the published path absent", async () => {
  const server = new PlMcpServer({ port: 0, secret: newSecret(), discoveryFilePath });
  await server.start();
  expect(existsSync(discoveryFilePath)).toBe(true);
  await server.stop();
  expect(existsSync(discoveryFilePath)).toBe(false);
});

test("a server given no discovery path publishes nothing", async () => {
  const server = new PlMcpServer({ port: 0, secret: newSecret() });
  await server.start();
  try {
    expect(await readdir(root)).toEqual([]);
  } finally {
    await server.stop();
  }
});
