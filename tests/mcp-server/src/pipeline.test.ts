import { test, expect } from "vitest";
import { withMcpServer } from "./with-mcp";
import path from "node:path";

function parseResult(result: unknown): unknown {
  const r = result as { content?: { type: string; text: string }[] };
  if (!r.content?.[0]) throw new Error("No content in result");
  return JSON.parse(r.content[0].text);
}

const enterNumbersBlockFolder = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "etc",
  "blocks",
  "enter-numbers-v3",
  "block",
);

test("await_block_done waits for completion", { timeout: 60_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const { projectId } = parseResult(
      await client.callTool({ name: "create_project", arguments: { label: "Pipeline Test" } }),
    ) as { projectId: string };
    await client.callTool({ name: "open_project", arguments: { projectId } });

    // Add enter-numbers block and set data
    const { blockId: enterId } = parseResult(
      await client.callTool({
        name: "add_block",
        arguments: {
          projectId,
          label: "Enter Numbers",
          spec: { type: "dev-v2", folder: enterNumbersBlockFolder },
        },
      }),
    ) as { blockId: string };

    await client.callTool({
      name: "set_block_data",
      arguments: { projectId, blockId: enterId, data: { numbers: [10, 20, 30] } },
    });

    // Run and await
    await client.callTool({ name: "run_block", arguments: { projectId, blockId: enterId } });

    const result = parseResult(
      await client.callTool({
        name: "await_block_done",
        arguments: { projectId, blockId: enterId, timeout: 30000 },
      }),
    ) as { status: string; data: unknown; outputs: unknown };

    expect(result.status).toBe("Done");
    expect(result.data).toEqual({ numbers: [10, 20, 30] });

    // Cleanup
    await client.callTool({ name: "close_project", arguments: { projectId } });
    await client.callTool({ name: "delete_project", arguments: { projectId } });
  });
});

test("await_block_done timeout", { timeout: 30_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const { projectId } = parseResult(
      await client.callTool({ name: "create_project", arguments: { label: "Timeout Test" } }),
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

    // Don't run the block — await should time out on NotCalculated
    const result = parseResult(
      await client.callTool({
        name: "await_block_done",
        arguments: { projectId, blockId, timeout: 3000 },
      }),
    ) as { timedOut: boolean; status: string };

    expect(result.timedOut).toBe(true);
    expect(result.status).toBe("NotCalculated");

    await client.callTool({ name: "close_project", arguments: { projectId } });
    await client.callTool({ name: "delete_project", arguments: { projectId } });
  });
});
