import { test, expect } from "vitest";
import { withMcpServer, getFreePort } from "./with-mcp";
import { PlMcpServer } from "@milaboratories/pl-mcp-server";
import type { McpSecret } from "@milaboratories/pl-mcp-server";
import { MiddleLayer, TestHelpers } from "@milaboratories/pl-middle-layer";
import type { PlClient } from "@milaboratories/pl-client";
import { randomUUID } from "node:crypto";
import path from "node:path";

test("ping tool returns ok", { timeout: 30_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const result = await client.callTool({ name: "ping", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify({ status: "ok", connected: true }) },
    ]);
  });
});

test("lists ping tool", { timeout: 30_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const { tools } = await client.listTools();
    const ping = tools.find((t) => t.name === "ping");
    expect(ping).toBeDefined();
    expect(ping!.description).toBe("Health check");
  });
});

test("wrong secret returns 404", { timeout: 30_000 }, async () => {
  const workFolder = path.resolve(import.meta.dirname, "..", "work", randomUUID());
  const secret = randomUUID().replace(/-/g, "") as McpSecret;
  const port = await getFreePort();

  await TestHelpers.withTempRoot(async (pl: PlClient) => {
    const ml = await MiddleLayer.init(pl, workFolder, {
      defaultTreeOptions: { pollingInterval: 250, stopPollingDelay: 500 },
      devBlockUpdateRecheckInterval: 300,
      localSecret: MiddleLayer.generateLocalSecret(),
      localProjections: [],
      openFileDialogCallback: () => {
        throw new Error("Not implemented.");
      },
    });
    ml.addRuntimeCapability("requiresUIAPIVersion", 1);
    ml.addRuntimeCapability("requiresUIAPIVersion", 2);
    ml.addRuntimeCapability("requiresUIAPIVersion", 3);

    const mcpServer = new PlMcpServer({ middleLayer: ml, port, secret });
    await mcpServer.start();

    try {
      const wrongUrl = `http://127.0.0.1:${port}/wrong-secret/mcp`;
      const response = await fetch(wrongUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: {} }),
      });
      expect(response.status).toBe(404);
    } finally {
      await mcpServer.stop();
      await ml.close();
    }
  });
});

test("wrong path returns 404", { timeout: 30_000 }, async () => {
  const workFolder = path.resolve(import.meta.dirname, "..", "work", randomUUID());
  const secret = randomUUID().replace(/-/g, "") as McpSecret;
  const port = await getFreePort();

  await TestHelpers.withTempRoot(async (pl: PlClient) => {
    const ml = await MiddleLayer.init(pl, workFolder, {
      defaultTreeOptions: { pollingInterval: 250, stopPollingDelay: 500 },
      devBlockUpdateRecheckInterval: 300,
      localSecret: MiddleLayer.generateLocalSecret(),
      localProjections: [],
      openFileDialogCallback: () => {
        throw new Error("Not implemented.");
      },
    });
    ml.addRuntimeCapability("requiresUIAPIVersion", 1);
    ml.addRuntimeCapability("requiresUIAPIVersion", 2);
    ml.addRuntimeCapability("requiresUIAPIVersion", 3);

    const mcpServer = new PlMcpServer({ middleLayer: ml, port, secret });
    await mcpServer.start();

    try {
      const wrongUrl = `http://127.0.0.1:${port}/${secret}/other`;
      const response = await fetch(wrongUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: {} }),
      });
      expect(response.status).toBe(404);
    } finally {
      await mcpServer.stop();
      await ml.close();
    }
  });
});
