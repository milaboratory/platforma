import { expect, test } from "vitest";
import { withMcpServer } from "./with-mcp";
import { desktopStandIns } from "./desktop-stand-ins";

const STAND_IN_STATUS = {
  connected: true,
  type: "local",
  addr: "http://127.0.0.1:6345",
  login: "default",
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

test("the stand-in answers the connection status", { timeout: 30_000 }, async () => {
  const standIns = desktopStandIns({ getConnectionStatus: async () => STAND_IN_STATUS });
  await withMcpServer(
    async ({ client }) => {
      const result = await client.callTool({ name: "get_connection_status", arguments: {} });
      expect(parseResult(result)).toEqual(STAND_IN_STATUS);
      expect(standIns.calls.map((c) => c.callback)).toEqual(["getConnectionStatus"]);
    },
    { callbacks: standIns.callbacks },
  );
});

test("no stand-ins reports that it cannot answer", { timeout: 30_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const result = await client.callTool({ name: "get_connection_status", arguments: {} });
    const text = errorText(result);
    expect(text).toMatch(/[Cc]onnection status is not available/);
    expect(text).toMatch(/Hint:/);
  });
});
