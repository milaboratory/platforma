import type { PlClient } from "@milaboratories/pl-client";
import { MiddleLayer, TestHelpers } from "@milaboratories/pl-middle-layer";
import { PlMcpServer } from "@milaboratories/pl-mcp-server";
import type { McpSecret } from "@milaboratories/pl-mcp-server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { randomUUID } from "node:crypto";
import path from "node:path";

export interface McpTestContext {
  client: Client;
  ml: MiddleLayer;
  serverUrl: string;
}

export async function withMcpServer(cb: (ctx: McpTestContext) => Promise<void>): Promise<void> {
  const workFolder = path.resolve(import.meta.dirname, "..", "work", randomUUID());
  const secret = randomUUID().replace(/-/g, "") as McpSecret;

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
    ml.addRuntimeCapability("requiresCreatePTable", 2);

    const mcpServer = new PlMcpServer({ middleLayer: ml, port: 0, secret });
    await mcpServer.start();

    const client = new Client({ name: "test-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(mcpServer.url));
    await client.connect(transport);

    try {
      await cb({ client, ml, serverUrl: mcpServer.url });
    } finally {
      await client.close();
      await mcpServer.stop();
      await ml.close();
    }
  });
}
