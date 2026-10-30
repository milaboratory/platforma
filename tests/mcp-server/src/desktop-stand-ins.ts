import type { PlMcpServerCallbacks } from "@milaboratories/pl-mcp-server";

export interface DesktopCall {
  callback: keyof PlMcpServerCallbacks;
  args: unknown[];
}

export interface DesktopStandIns {
  callbacks: PlMcpServerCallbacks;
  calls: DesktopCall[];
}

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

const STAND_IN_BLOCK = {
  registryUrl: "https://stand-in.invalid/registry",
  organization: "stand-in",
  name: "stand-in-block",
  version: "1.0.0",
};

const STAND_IN_LOG = "stand-in log line";

export function desktopStandIns(overrides: Partial<PlMcpServerCallbacks> = {}): DesktopStandIns {
  const calls: DesktopCall[] = [];

  const defaults: Required<PlMcpServerCallbacks> = {
    onProjectCreated: async () => undefined,
    onProjectOpened: async () => undefined,
    onProjectClosed: async () => undefined,
    onProjectDeleted: async () => undefined,
    captureScreenshot: async () => ONE_PIXEL_PNG_BASE64,
    sendInputEvent: async () => undefined,
    executeJavaScript: async () => null,
    listAvailableBlocks: async () => [STAND_IN_BLOCK],
    selectBlock: async () => ({ ready: true }),
    readAppLog: async () => STAND_IN_LOG,
    listConnections: async () => [],
    connectToServer: async () => ({ status: "ok", message: "" }),
    getConnectionStatus: async () => ({ connected: true }),
    disconnect: async () => undefined,
    getBlockInfo: async () => STAND_IN_BLOCK,
  };

  const callbacks: Record<string, unknown> = {};
  for (const name of Object.keys(defaults) as (keyof PlMcpServerCallbacks)[]) {
    const impl = (overrides[name] ?? defaults[name]) as (...args: unknown[]) => Promise<unknown>;
    callbacks[name] = async (...args: unknown[]) => {
      calls.push({ callback: name, args });
      return impl(...args);
    };
  }

  return { callbacks: callbacks as PlMcpServerCallbacks, calls };
}
