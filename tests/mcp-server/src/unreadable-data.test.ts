import { expect, test } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { withMcpServer } from "./with-mcp";
import path from "node:path";

const UNHELD_HANDLE = "f".repeat(64);

const enterNumbersBlockFolder = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "etc",
  "blocks",
  "enter-numbers",
  "block",
);

function parseResult(result: unknown): unknown {
  const r = result as { isError?: boolean; content?: { type: string; text: string }[] };
  expect(r.isError).not.toBe(true);
  if (!r.content?.[0]) throw new Error("No content in result");
  return JSON.parse(r.content[0].text);
}

function errorText(result: unknown): string {
  const r = result as { isError?: boolean; content?: { type: string; text: string }[] };
  expect(r.isError).toBe(true);
  return r.content?.[0]?.text ?? "";
}

async function projectWithBlock(client: Client) {
  const { projectId } = parseResult(
    await client.callTool({ name: "create_project", arguments: { label: "Unreadable Test" } }),
  ) as { projectId: string };
  await client.callTool({ name: "open_project", arguments: { projectId } });
  const { blockId } = parseResult(
    await client.callTool({
      name: "add_block",
      arguments: {
        projectId,
        label: "Enter Numbers",
        spec: { type: "dev-v2", folder: enterNumbersBlockFolder },
      },
    }),
  ) as { blockId: string };
  return { projectId, blockId };
}

test(
  "an empty column list is refused before the driver is touched",
  { timeout: 30_000 },
  async () => {
    await withMcpServer(async ({ client }) => {
      const result = await client.callTool({
        name: "query_table",
        arguments: { pTableHandle: UNHELD_HANDLE, columns: [] },
      });
      const text = errorText(result);
      expect(text).toMatch(/columns list is empty/);
      expect(text).toMatch(/Omit columns/);
      expect(text).toMatch(/pass the indices you want/);
    });
  },
);

test("a refused spec read is an error, not a success payload", { timeout: 30_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const result = await client.callTool({
      name: "query_table",
      arguments: { pTableHandle: UNHELD_HANDLE },
    });
    const text = errorText(result);
    expect(text).toMatch(/Reading the table spec failed/);
    expect(text).toMatch(/Hint:/);
  });
});

test("a healthy block-state read is unchanged", { timeout: 30_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const { projectId, blockId } = await projectWithBlock(client);

    await client.callTool({
      name: "set_block_data",
      arguments: { projectId, blockId, args: { numbers: [1, 2, 3] } },
    });

    const state = parseResult(
      await client.callTool({ name: "get_block_state", arguments: { projectId, blockId } }),
    ) as { data: unknown; outputs: unknown[] };

    expect(state.data).toBeDefined();
    expect(Array.isArray(state.outputs)).toBe(true);

    await client.callTool({ name: "close_project", arguments: { projectId } });
    await client.callTool({ name: "delete_project", arguments: { projectId } });
  });
});

test("a healthy outputs read is unchanged", { timeout: 30_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const { projectId, blockId } = await projectWithBlock(client);

    const outputs = parseResult(
      await client.callTool({ name: "get_block_outputs", arguments: { projectId, blockId } }),
    );

    expect(outputs).toBeDefined();
    expect(JSON.stringify(outputs)).not.toContain("UnresolvedHandle");

    await client.callTool({ name: "close_project", arguments: { projectId } });
    await client.callTool({ name: "delete_project", arguments: { projectId } });
  });
});
