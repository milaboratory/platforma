import { describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MiddleLayer } from "@milaboratories/pl-middle-layer";
import type { PFrameDriver } from "@milaboratories/pl-model-common";
import { registerDataQueryTools, resolveHandle } from "./data-query";
import type { ToolContext } from "./types";
import type { UnresolvedHandle } from "./unreadable";

const HANDLE = "a".repeat(64);

function stubDriver(behaviour: {
  getSpec?: () => Promise<unknown>;
  getShape?: () => Promise<unknown>;
  listColumns?: () => Promise<unknown>;
  getData?: () => Promise<unknown>;
  onCall?: (name: string) => void;
}): PFrameDriver {
  const fail = (name: string) => async () => {
    behaviour.onCall?.(name);
    throw new Error(`${name} refused`);
  };
  return {
    getSpec: async () => {
      behaviour.onCall?.("getSpec");
      if (!behaviour.getSpec) throw new Error("getSpec refused");
      return behaviour.getSpec();
    },
    getShape: async () => {
      behaviour.onCall?.("getShape");
      if (!behaviour.getShape) throw new Error("getShape refused");
      return behaviour.getShape();
    },
    listColumns: async () => {
      behaviour.onCall?.("listColumns");
      if (!behaviour.listColumns) throw new Error("listColumns refused");
      return behaviour.listColumns();
    },
    getData: behaviour.getData
      ? async () => {
          behaviour.onCall?.("getData");
          return behaviour.getData!();
        }
      : fail("getData"),
  } as unknown as PFrameDriver;
}

type Handler = (args: unknown) => Promise<{
  isError?: boolean;
  content: { type: string; text: string }[];
}>;

function callQueryTable(driver: PFrameDriver): Handler {
  const handlers = new Map<string, Handler>();
  const server = {
    registerTool: (name: string, _config: unknown, handler: Handler) => handlers.set(name, handler),
  } as unknown as McpServer;
  registerDataQueryTools(server, {
    getMl: () => null,
    requireMl: () => ({ internalDriverKit: { pFrameDriver: driver } }) as unknown as MiddleLayer,
    resolveProject: async () => {
      throw new Error("unused");
    },
    getOpenedProject: async () => {
      throw new Error("unused");
    },
    callbacks: {},
    getAuthorMarker: () => ({ authorId: "test", localVersion: 1 }),
  } as ToolContext);
  const handler = handlers.get("query_table");
  if (!handler) throw new Error("query_table was not registered");
  return handler;
}

describe("resolveHandle", () => {
  it("returns the table summary and never reads the frame", async () => {
    const seen: string[] = [];
    const driver = stubDriver({
      getSpec: async () => [{ type: "column", spec: { name: "id", valueType: "Int" } }],
      getShape: async () => ({ rows: 7 }),
      onCall: (n) => seen.push(n),
    });

    const result = (await resolveHandle(HANDLE, driver, 30, new Map())) as Record<string, unknown>;

    expect(result._type).toBe("PTable");
    expect(result.rows).toBe(7);
    expect(seen).not.toContain("listColumns");
  });

  it("returns an unresolved entry carrying both read messages when neither answers", async () => {
    const driver = stubDriver({});

    const result = (await resolveHandle(HANDLE, driver, 30, new Map())) as UnresolvedHandle;

    expect(result._type).toBe("UnresolvedHandle");
    expect(result.handle).toBe(HANDLE);
    expect(result.pTableError).toMatch(/refused/);
    expect(result.pFrameError).toMatch(/refused/);
    expect(result.hint).toMatch(/may not be a table handle/);
  });

  it("answers a repeated value from the cache, attempting the reads once", async () => {
    const seen: string[] = [];
    const driver = stubDriver({ onCall: (n) => seen.push(n) });
    const cache = new Map<string, unknown>();

    const first = await resolveHandle(HANDLE, driver, 30, cache);
    const attempts = seen.length;
    const second = await resolveHandle(HANDLE, driver, 30, cache);

    expect(second).toBe(first);
    expect(seen.length).toBe(attempts);
  });
});

describe("query_table", () => {
  it("refuses a Bytes-typed column instead of reading it", async () => {
    const driver = stubDriver({
      getSpec: async () => [{ type: "column", spec: { name: "raw", valueType: "Bytes" } }],
    });

    const result = await callQueryTable(driver)({ pTableHandle: HANDLE, columns: [0] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/cannot return/);
  });

  it("reports a table-data read failure after the spec read has already succeeded", async () => {
    const driver = stubDriver({
      getSpec: async () => [{ type: "column", spec: { name: "id", valueType: "Int" } }],
      getData: async () => {
        throw new Error("boom");
      },
    });

    const result = await callQueryTable(driver)({ pTableHandle: HANDLE, columns: [0] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Reading the table data failed/);
  });
});
