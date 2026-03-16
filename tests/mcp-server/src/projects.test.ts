import { test, expect } from "vitest";
import { withMcpServer } from "./with-mcp";

function parseResult(result: unknown): unknown {
  const r = result as { content?: { type: string; text: string }[] };
  if (!r.content?.[0]) throw new Error("No content in result");
  return JSON.parse(r.content[0].text);
}

test("create and list projects", { timeout: 30_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    // Initially empty
    const emptyList = parseResult(
      await client.callTool({ name: "list_projects", arguments: {} }),
    ) as unknown[];
    expect(emptyList).toEqual([]);

    // Create a project
    const created = parseResult(
      await client.callTool({ name: "create_project", arguments: { label: "Test Project" } }),
    ) as { projectId: string };
    expect(created.projectId).toBeDefined();

    // List should contain the project
    const list = parseResult(
      await client.callTool({ name: "list_projects", arguments: {} }),
    ) as { projectId: string; label: string; opened: boolean }[];
    expect(list).toHaveLength(1);
    expect(list[0].projectId).toBe(created.projectId);
    expect(list[0].label).toBe("Test Project");
    expect(list[0].opened).toBe(false);
  });
});

test("open and close project", { timeout: 30_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const { projectId } = parseResult(
      await client.callTool({ name: "create_project", arguments: { label: "Open Close Test" } }),
    ) as { projectId: string };

    // Open
    const openResult = parseResult(
      await client.callTool({ name: "open_project", arguments: { projectId } }),
    ) as { ok: boolean };
    expect(openResult.ok).toBe(true);

    // Verify it's opened
    const list = parseResult(
      await client.callTool({ name: "list_projects", arguments: {} }),
    ) as { projectId: string; opened: boolean }[];
    expect(list[0].opened).toBe(true);

    // Close
    const closeResult = parseResult(
      await client.callTool({ name: "close_project", arguments: { projectId } }),
    ) as { ok: boolean };
    expect(closeResult.ok).toBe(true);

    // Verify it's closed
    const list2 = parseResult(
      await client.callTool({ name: "list_projects", arguments: {} }),
    ) as { projectId: string; opened: boolean }[];
    expect(list2[0].opened).toBe(false);
  });
});

test("delete project", { timeout: 30_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const { projectId } = parseResult(
      await client.callTool({ name: "create_project", arguments: { label: "To Delete" } }),
    ) as { projectId: string };

    // Delete
    const deleteResult = parseResult(
      await client.callTool({ name: "delete_project", arguments: { projectId } }),
    ) as { ok: boolean };
    expect(deleteResult.ok).toBe(true);

    // Verify it's gone
    const list = parseResult(
      await client.callTool({ name: "list_projects", arguments: {} }),
    ) as unknown[];
    expect(list).toHaveLength(0);
  });
});

test("full lifecycle: create, open, close, delete", { timeout: 30_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    // Create two projects
    const { projectId: id1 } = parseResult(
      await client.callTool({ name: "create_project", arguments: { label: "Project A" } }),
    ) as { projectId: string };
    const { projectId: id2 } = parseResult(
      await client.callTool({ name: "create_project", arguments: { label: "Project B" } }),
    ) as { projectId: string };

    const list = parseResult(
      await client.callTool({ name: "list_projects", arguments: {} }),
    ) as unknown[];
    expect(list).toHaveLength(2);

    // Open both
    await client.callTool({ name: "open_project", arguments: { projectId: id1 } });
    await client.callTool({ name: "open_project", arguments: { projectId: id2 } });

    // Close and delete first
    await client.callTool({ name: "close_project", arguments: { projectId: id1 } });
    await client.callTool({ name: "delete_project", arguments: { projectId: id1 } });

    // Only second remains
    const remaining = parseResult(
      await client.callTool({ name: "list_projects", arguments: {} }),
    ) as { projectId: string }[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].projectId).toBe(id2);

    // Close and delete second
    await client.callTool({ name: "close_project", arguments: { projectId: id2 } });
    await client.callTool({ name: "delete_project", arguments: { projectId: id2 } });

    const empty = parseResult(
      await client.callTool({ name: "list_projects", arguments: {} }),
    ) as unknown[];
    expect(empty).toHaveLength(0);
  });
});

test("tools are listed", { timeout: 30_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("list_projects");
    expect(names).toContain("create_project");
    expect(names).toContain("open_project");
    expect(names).toContain("close_project");
    expect(names).toContain("delete_project");
  });
});
