import { describe, expect, it } from "vitest";
import { desktopStandIns } from "./desktop-stand-ins";

const CALLBACK_NAMES = [
  "onProjectCreated",
  "onProjectOpened",
  "onProjectClosed",
  "onProjectDeleted",
  "captureScreenshot",
  "sendInputEvent",
  "executeJavaScript",
  "listAvailableBlocks",
  "selectBlock",
  "readAppLog",
  "listConnections",
  "connectToServer",
  "getConnectionStatus",
  "disconnect",
  "getBlockInfo",
] as const;

describe("desktopStandIns", () => {
  it("answers every callback the server interface declares", () => {
    const { callbacks } = desktopStandIns();
    for (const name of CALLBACK_NAMES) {
      expect(typeof callbacks[name]).toBe("function");
    }
    expect(Object.keys(callbacks).sort()).toEqual([...CALLBACK_NAMES].sort());
  });

  it("records one call naming the callback and carrying its arguments in order", async () => {
    const standIns = desktopStandIns();
    await standIns.callbacks.readAppLog?.(10, "boot");
    expect(standIns.calls).toEqual([{ callback: "readAppLog", args: [10, "boot"] }]);
  });

  it("replaces only the overridden callback", async () => {
    const standIns = desktopStandIns({ readAppLog: async () => "overridden" });
    await expect(standIns.callbacks.readAppLog?.(1)).resolves.toBe("overridden");
    await expect(standIns.callbacks.listConnections?.()).resolves.toEqual([]);
  });

  it("records an overridden callback too", async () => {
    const standIns = desktopStandIns({ readAppLog: async () => "overridden" });
    await standIns.callbacks.readAppLog?.(5, "x");
    expect(standIns.calls).toEqual([{ callback: "readAppLog", args: [5, "x"] }]);
  });
});
