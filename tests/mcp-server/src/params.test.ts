import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { test, expect } from "vitest";
import { withMcpServer } from "./with-mcp";
import { expectToolError, parseResult } from "./tool-call";
import path from "node:path";

const blocksFolder = path.resolve(import.meta.dirname, "..", "..", "..", "etc", "blocks");
const enterNumbersSpec = {
  type: "dev-v2",
  folder: path.resolve(blocksFolder, "enter-numbers", "block"),
};
const sumNumbersSpec = {
  type: "dev-v2",
  folder: path.resolve(blocksFolder, "sum-numbers", "block"),
};

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<unknown> {
  return parseResult(await client.callTool({ name, arguments: args }));
}

async function openNewProject(client: Client, label: string): Promise<string> {
  const { projectId } = (await call(client, "create_project", { label })) as { projectId: string };
  await call(client, "open_project", { projectId });
  return projectId;
}

async function blockData(client: Client, projectId: string, blockId: string): Promise<unknown> {
  return await call(client, "get_block_state", { projectId, blockId, transform: "data" });
}

async function blockIdsOf(client: Client, projectId: string): Promise<string[]> {
  const overview = (await call(client, "get_project_overview", { projectId })) as {
    blocks: { id: string }[];
  };
  return overview.blocks.map((block) => block.id);
}

test("add_block with params starts the block from them", { timeout: 60_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const projectId = await openNewProject(client, "Params: init");

    const { blockId } = (await call(client, "add_block", {
      projectId,
      label: "Enter Numbers",
      spec: enterNumbersSpec,
      params: { numbers: [3, 1, 2] },
    })) as { blockId: string };

    expect(await blockData(client, projectId, blockId)).toMatchObject({ numbers: [3, 1, 2] });

    const exported = (await call(client, "get_block_params", { projectId, blockId })) as {
      kind?: string;
      params: unknown;
    };
    expect(exported.params).toEqual({ numbers: [3, 1, 2] });
    expect(exported.kind).toContain("test-enter-numbers.kind@");
  });
});

test("add_block without params keeps the default state", { timeout: 60_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const projectId = await openNewProject(client, "Params: default");

    const { blockId } = (await call(client, "add_block", {
      projectId,
      label: "Enter Numbers",
      spec: enterNumbersSpec,
    })) as { blockId: string };

    expect(await blockData(client, projectId, blockId)).toMatchObject({ numbers: [] });
  });
});

test("params reference an upstream block by its real id", { timeout: 60_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const projectId = await openNewProject(client, "Params: real id");

    const { blockId: numbersId } = (await call(client, "add_block", {
      projectId,
      label: "Enter Numbers",
      spec: enterNumbersSpec,
      params: { numbers: [1, 2] },
    })) as { blockId: string };

    const reference = { __isRef: true, blockId: numbersId, name: "numbers" };
    const { blockId: sumId } = (await call(client, "add_block", {
      projectId,
      label: "Sum Numbers",
      spec: sumNumbersSpec,
      params: { sources: [reference] },
    })) as { blockId: string };

    expect(await blockData(client, projectId, sumId)).toEqual({ sources: [reference] });
  });
});

test("blockIds points copied params at blocks of this project", { timeout: 60_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const projectId = await openNewProject(client, "Params: block ids");

    const { blockId: numbersId } = (await call(client, "add_block", {
      projectId,
      label: "Enter Numbers",
      spec: enterNumbersSpec,
      params: { numbers: [1, 2] },
    })) as { blockId: string };

    const { blockId: sumId } = (await call(client, "add_block", {
      projectId,
      label: "Sum Numbers",
      spec: sumNumbersSpec,
      params: { sources: [{ __isRef: true, blockId: "numbers-entry", name: "numbers" }] },
      blockIds: { "numbers-entry": numbersId },
    })) as { blockId: string };

    expect(await blockData(client, projectId, sumId)).toEqual({
      sources: [{ __isRef: true, blockId: numbersId, name: "numbers" }],
    });
  });
});

test("params read from one block recreate it in another", { timeout: 60_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const projectId = await openNewProject(client, "Params: round trip");

    const { blockId: sourceId } = (await call(client, "add_block", {
      projectId,
      label: "Source",
      spec: enterNumbersSpec,
    })) as { blockId: string };
    await call(client, "set_block_data", {
      projectId,
      blockId: sourceId,
      data: { numbers: [5, 4], labels: [], description: "" },
    });

    const { params } = (await call(client, "get_block_params", {
      projectId,
      blockId: sourceId,
    })) as { params: Record<string, unknown> };

    const { blockId: copyId } = (await call(client, "add_block", {
      projectId,
      label: "Copy",
      spec: enterNumbersSpec,
      params,
    })) as { blockId: string };

    expect(await blockData(client, projectId, copyId)).toMatchObject({ numbers: [5, 4] });
  });
});

test("params the kind rejects create nothing", { timeout: 60_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const projectId = await openNewProject(client, "Params: rejected");

    const error = expectToolError(
      await client.callTool({
        name: "add_block",
        arguments: {
          projectId,
          label: "Enter Numbers",
          spec: enterNumbersSpec,
          params: { numbers: "not numbers" },
        },
      }),
    );

    expect(error).toContain("'numbers' must be an array of numbers");
    expect(error).toContain("Nothing was created");
    expect(await blockIdsOf(client, projectId)).toEqual([]);
  });
});

test("before places the new block ahead of an existing one", { timeout: 60_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const projectId = await openNewProject(client, "Params: before");

    const { blockId: firstId } = (await call(client, "add_block", {
      projectId,
      label: "First",
      spec: enterNumbersSpec,
    })) as { blockId: string };
    const { blockId: secondId } = (await call(client, "add_block", {
      projectId,
      label: "Second",
      spec: enterNumbersSpec,
      before: firstId,
    })) as { blockId: string };

    expect(await blockIdsOf(client, projectId)).toEqual([secondId, firstId]);
  });
});

test(
  "open_project tells the application whether to switch to it",
  { timeout: 60_000 },
  async () => {
    const opened: { projectId: string; activate: boolean }[] = [];
    await withMcpServer(
      async ({ client }) => {
        const { projectId } = (await call(client, "create_project", { label: "Activate" })) as {
          projectId: string;
        };

        await call(client, "open_project", { projectId, activate: false });
        await call(client, "close_project", { projectId });
        await call(client, "open_project", { projectId });

        expect(opened).toEqual([
          { projectId, activate: false },
          { projectId, activate: true },
        ]);
      },
      {
        callbacks: {
          onProjectOpened: (projectId, ops) => {
            opened.push({ projectId, activate: ops.activate });
          },
        },
      },
    );
  },
);
