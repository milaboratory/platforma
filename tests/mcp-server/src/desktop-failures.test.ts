import { afterEach, beforeEach, expect, test } from "vitest";
import { withMcpServer } from "./with-mcp";
import { desktopStandIns } from "./desktop-stand-ins";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "desktop-failures-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

type Result = {
  isError?: boolean;
  content?: { type: string; text?: string; data?: string }[];
};

function errorText(result: unknown): string {
  const r = result as Result;
  expect(r.isError).toBe(true);
  return r.content?.[0]?.text ?? "";
}

test("an empty capture is reported as a failure", { timeout: 30_000 }, async () => {
  const standIns = desktopStandIns({ captureScreenshot: async () => "" });
  await withMcpServer(
    async ({ client }) => {
      const result = (await client.callTool({
        name: "capture_screenshot",
        arguments: {},
      })) as Result;
      const text = errorText(result);
      expect(text).toMatch(/returned no image/);
      expect(text).toMatch(/get_app_log/);
      expect(result.content?.some((c) => c.type === "image")).not.toBe(true);
    },
    { callbacks: standIns.callbacks },
  );
});

test("a working capture is unchanged", { timeout: 30_000 }, async () => {
  const standIns = desktopStandIns({ captureScreenshot: async () => ONE_PIXEL_PNG_BASE64 });
  await withMcpServer(
    async ({ client }) => {
      const result = (await client.callTool({
        name: "capture_screenshot",
        arguments: {},
      })) as Result;
      expect(result.isError).not.toBe(true);
      expect(result.content?.[0]).toMatchObject({ type: "image", data: ONE_PIXEL_PNG_BASE64 });
    },
    { callbacks: standIns.callbacks },
  );
});

test("an empty capture writes nothing to the save path", { timeout: 30_000 }, async () => {
  const savePath = join(root, "shot.png");
  const standIns = desktopStandIns({ captureScreenshot: async () => "" });
  await withMcpServer(
    async ({ client }) => {
      const result = await client.callTool({
        name: "capture_screenshot",
        arguments: { savePath },
      });
      expect(errorText(result)).toMatch(/returned no image/);
      expect(existsSync(savePath)).toBe(false);
    },
    { callbacks: standIns.callbacks },
  );
});

test("a selection that never became ready is reported", { timeout: 30_000 }, async () => {
  const standIns = desktopStandIns({ selectBlock: async () => ({ ready: false }) });
  await withMcpServer(
    async ({ client }) => {
      const result = await client.callTool({
        name: "select_block",
        arguments: { projectId: "p", blockId: "b" },
      });
      const text = errorText(result);
      expect(text).toMatch(/never became ready/);
      expect(text).toMatch(/get_app_log/);
      expect(text).not.toMatch(/"ok"/);
    },
    { callbacks: standIns.callbacks },
  );
});

test("a ready selection reports success and records its arguments", { timeout: 30_000 }, async () => {
  const standIns = desktopStandIns({ selectBlock: async () => ({ ready: true }) });
  await withMcpServer(
    async ({ client }) => {
      const result = (await client.callTool({
        name: "select_block",
        arguments: { projectId: "p", blockId: "b" },
      })) as Result;
      expect(result.isError).not.toBe(true);
      expect(JSON.parse(result.content?.[0]?.text ?? "{}")).toEqual({ ok: true });
      expect(standIns.calls).toEqual([{ callback: "selectBlock", args: ["p", "b"] }]);
    },
    { callbacks: standIns.callbacks },
  );
});
