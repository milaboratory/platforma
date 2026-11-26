import { test, expect } from "vitest";
import { withMcpServer } from "./with-mcp";
import { parseResult } from "./tool-call";
import path from "node:path";

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

const devBlockSpec = {
  type: "dev-v2",
  folder: enterNumbersBlockFolder,
};

test("add and remove block", { timeout: 30_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    // Create and open a project
    const { projectId } = parseResult(
      await client.callTool({ name: "create_project", arguments: { label: "Block Test" } }),
    ) as { projectId: string };
    await client.callTool({ name: "open_project", arguments: { projectId } });

    // Add a block
    const { blockId } = parseResult(
      await client.callTool({
        name: "add_block",
        arguments: {
          projectId,
          label: "Enter Numbers",
          spec: devBlockSpec,
        },
      }),
    ) as { blockId: string };
    expect(blockId).toBeDefined();

    // Remove the block
    const removeResult = parseResult(
      await client.callTool({
        name: "remove_block",
        arguments: { projectId, blockId },
      }),
    ) as { ok: boolean };
    expect(removeResult.ok).toBe(true);

    // Cleanup
    await client.callTool({ name: "close_project", arguments: { projectId } });
    await client.callTool({ name: "delete_project", arguments: { projectId } });
  });
});

test("block tools are listed", { timeout: 30_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("add_block");
    expect(names).toContain("remove_block");
    expect(names).toContain("run_block");
    expect(names).toContain("stop_block");
  });
});
