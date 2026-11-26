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

test("get_project_overview returns block info", { timeout: 30_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const { projectId } = parseResult(
      await client.callTool({ name: "create_project", arguments: { label: "State Test" } }),
    ) as { projectId: string };
    await client.callTool({ name: "open_project", arguments: { projectId } });

    await client.callTool({
      name: "add_block",
      arguments: {
        projectId,
        label: "Enter Numbers",
        spec: { type: "dev-v2", folder: enterNumbersBlockFolder },
      },
    });

    const overview = parseResult(
      await client.callTool({ name: "get_project_overview", arguments: { projectId } }),
    ) as { label: string; blocks: { id: string; title: string; calculationStatus: string }[] };

    expect(overview.label).toBe("State Test");
    expect(overview.blocks).toHaveLength(1);
    expect(overview.blocks[0].title).toBeDefined();
    expect(overview.blocks[0].calculationStatus).toBeDefined();

    await client.callTool({ name: "close_project", arguments: { projectId } });
    await client.callTool({ name: "delete_project", arguments: { projectId } });
  });
});

test("set_block_data and get_block_state", { timeout: 30_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const { projectId } = parseResult(
      await client.callTool({ name: "create_project", arguments: { label: "Data Test" } }),
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

    // Set data
    const setResult = parseResult(
      await client.callTool({
        name: "set_block_data",
        arguments: {
          projectId,
          blockId,
          data: { numbers: [10, 20, 30] },
        },
      }),
    ) as { ok: boolean };
    expect(setResult.ok).toBe(true);

    // Read data back
    const state = parseResult(
      await client.callTool({
        name: "get_block_state",
        arguments: { projectId, blockId },
      }),
    ) as { data: unknown; outputs: unknown };
    expect(state.data).toEqual({ numbers: [10, 20, 30] });

    await client.callTool({ name: "close_project", arguments: { projectId } });
    await client.callTool({ name: "delete_project", arguments: { projectId } });
  });
});

test("state tools are listed", { timeout: 30_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("get_project_overview");
    expect(names).toContain("get_block_state");
    expect(names).toContain("set_block_data");
  });
});
