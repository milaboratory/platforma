import { expect, test } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { withMcpServer } from "./with-mcp";
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

type Entry = { ok: boolean; value?: unknown; error?: string; hint?: string };

function parseResult(result: unknown): unknown {
  const r = result as { isError?: boolean; content?: { type: string; text: string }[] };
  expect(r.isError).not.toBe(true);
  if (!r.content?.[0]) throw new Error("No content in result");
  return JSON.parse(r.content[0].text);
}

function entries(result: unknown): Record<string, Entry> {
  return parseResult(result) as Record<string, Entry>;
}

function errorText(result: unknown): string {
  const r = result as { isError?: boolean; content?: { type: string; text: string }[] };
  expect(r.isError).toBe(true);
  return r.content?.[0]?.text ?? "";
}

async function addBlock(client: Client, projectId: string, label: string): Promise<string> {
  const { blockId } = parseResult(
    await client.callTool({
      name: "add_block",
      arguments: {
        projectId,
        label,
        spec: { type: "dev-v2", folder: enterNumbersBlockFolder },
      },
    }),
  ) as { blockId: string };
  return blockId;
}

async function openProject(client: Client): Promise<string> {
  const { projectId } = parseResult(
    await client.callTool({ name: "create_project", arguments: { label: "Batch Read Test" } }),
  ) as { projectId: string };
  await client.callTool({ name: "open_project", arguments: { projectId } });
  return projectId;
}

test("two known blocks and one unknown id give three entries", { timeout: 60_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const projectId = await openProject(client);
    const first = await addBlock(client, projectId, "First");
    const second = await addBlock(client, projectId, "Second");

    for (const blockId of [first, second]) {
      await client.callTool({
        name: "set_block_data",
        arguments: { projectId, blockId, args: { numbers: [1, 2] } },
      });
    }

    const got = entries(
      await client.callTool({
        name: "get_block_state",
        arguments: { projectId, blockIds: [first, second, "no-such-block"] },
      }),
    );

    expect(Object.keys(got).sort()).toEqual([first, second, "no-such-block"].sort());
    expect(got[first].ok).toBe(true);
    expect(got[second].ok).toBe(true);
    expect(got["no-such-block"].ok).toBe(false);
    expect(got["no-such-block"].hint).toBeTruthy();

    await client.callTool({ name: "close_project", arguments: { projectId } });
    await client.callTool({ name: "delete_project", arguments: { projectId } });
  });
});

test("eleven ids are refused before any read", { timeout: 30_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const projectId = await openProject(client);
    const result = await client.callTool({
      name: "get_block_state",
      arguments: {
        projectId,
        blockIds: Array.from({ length: 11 }, (_, i) => `b-${i}`),
      },
    });
    const text = errorText(result);
    expect(text).toContain("11");
    expect(text).toContain("10");
    expect(text).not.toContain('b-0":');

    await client.callTool({ name: "delete_project", arguments: { projectId } });
  });
});

test("an empty list and a duplicated id are each refused", { timeout: 30_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const projectId = await openProject(client);

    expect(
      errorText(
        await client.callTool({
          name: "get_block_state",
          arguments: { projectId, blockIds: [] },
        }),
      ),
    ).toMatch(/empty/);

    expect(
      errorText(
        await client.callTool({
          name: "get_block_state",
          arguments: { projectId, blockIds: ["a", "a"] },
        }),
      ),
    ).toMatch(/more than once/);

    await client.callTool({ name: "delete_project", arguments: { projectId } });
  });
});

test("outputs come back per block, each with its own error", { timeout: 60_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const projectId = await openProject(client);
    const blockId = await addBlock(client, projectId, "Only");

    const got = entries(
      await client.callTool({
        name: "get_block_outputs",
        arguments: { projectId, blockIds: [blockId, "no-such-block"] },
      }),
    );

    expect(Object.keys(got).sort()).toEqual([blockId, "no-such-block"].sort());
    expect(got["no-such-block"].ok).toBe(false);

    await client.callTool({ name: "close_project", arguments: { projectId } });
    await client.callTool({ name: "delete_project", arguments: { projectId } });
  });
});

test("logs come back per block", { timeout: 60_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const projectId = await openProject(client);
    const blockId = await addBlock(client, projectId, "Only");

    const got = entries(
      await client.callTool({
        name: "get_block_logs",
        arguments: { projectId, blockIds: [blockId, "no-such-block"] },
      }),
    );

    expect(Object.keys(got).sort()).toEqual([blockId, "no-such-block"].sort());
    expect(Object.values(got).map((e) => typeof e.ok)).toEqual(["boolean", "boolean"]);
    expect(got["no-such-block"].ok).toBe(false);
    expect(got["no-such-block"].hint).toBeTruthy();

    await client.callTool({ name: "close_project", arguments: { projectId } });
    await client.callTool({ name: "delete_project", arguments: { projectId } });
  });
});

test(
  "the three read tools declare blockIds and state the maximum",
  { timeout: 30_000 },
  async () => {
    await withMcpServer(async ({ client }) => {
      const { tools } = await client.listTools();
      const byName = new Map(tools.map((t) => [t.name, t]));

      for (const name of ["get_block_state", "get_block_outputs", "get_block_logs"]) {
        const tool = byName.get(name);
        expect(tool).toBeDefined();
        if (!tool) continue;
        const properties = (tool.inputSchema as { properties?: Record<string, unknown> })
          .properties;
        const declared = Object.keys(properties ?? {});
        expect({ name, declared }).toEqual({
          name,
          declared: expect.arrayContaining(["blockIds"]),
        });
        expect(declared).not.toContain("blockId");
        expect({ name, statesMax: tool.description?.includes("10") }).toEqual({
          name,
          statesMax: true,
        });
      }

      const write = byName.get("set_block_data");
      expect(write).toBeDefined();
      const writeProperties = (
        write?.inputSchema as { properties?: Record<string, unknown> } | undefined
      )?.properties;
      expect(Object.keys(writeProperties ?? {})).toContain("blockId");
    });
  },
);
