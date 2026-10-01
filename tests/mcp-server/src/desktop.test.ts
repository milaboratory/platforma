import { expect, test } from "vitest";
import { withMcpServer } from "./with-mcp";
import { desktopStandIns } from "./desktop-stand-ins";

const STAND_IN_BLOCK = {
  registryUrl: "https://stand-in.invalid/registry",
  organization: "stand-in",
  name: "stand-in-block",
  version: "1.0.0",
};

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

test("a registry tool returns what the stand-in answers", { timeout: 30_000 }, async () => {
  const standIns = desktopStandIns({ listAvailableBlocks: async () => [STAND_IN_BLOCK] });
  await withMcpServer(
    async ({ client }) => {
      const result = await client.callTool({ name: "list_available_blocks", arguments: {} });
      expect(parseResult(result)).toEqual([STAND_IN_BLOCK]);
    },
    { callbacks: standIns.callbacks },
  );
});

test("a stand-in sees the arguments the tool passed", { timeout: 30_000 }, async () => {
  const standIns = desktopStandIns({ readAppLog: async () => "boot\nready" });
  await withMcpServer(
    async ({ client }) => {
      const result = await client.callTool({
        name: "get_app_log",
        arguments: { lines: 10, search: "boot" },
      });
      expect(parseResult(result)).toEqual({ log: "boot\nready" });
      expect(standIns.calls).toEqual([{ callback: "readAppLog", args: [10, "boot"] }]);
    },
    { callbacks: standIns.callbacks },
  );
});

test("an input tool sends a mouse down then a mouse up", { timeout: 30_000 }, async () => {
  const standIns = desktopStandIns();
  await withMcpServer(
    async ({ client }) => {
      const result = await client.callTool({ name: "click", arguments: { x: 12, y: 34 } });
      expect(parseResult(result)).toEqual({ ok: true });

      const events = standIns.calls.map((c) => c.args[0] as { type: string; x: number; y: number });
      expect(events.map((e) => e.type)).toEqual(["mouseDown", "mouseUp"]);
      for (const event of events) {
        expect({ x: event.x, y: event.y }).toEqual({ x: 12, y: 34 });
      }
    },
    { callbacks: standIns.callbacks },
  );
});

test("no stand-ins leaves the absent-callback error in place", { timeout: 30_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const result = await client.callTool({ name: "list_available_blocks", arguments: {} });
    expect(errorText(result)).toMatch(/not available/i);
  });
});
