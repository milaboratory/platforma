import { expect, onTestFinished, test, vi } from "vitest";
import { Computable } from "@milaboratories/computable";
import { asSignedResourceId } from "@milaboratories/pl-client";
import type { ResourceInfo } from "@milaboratories/pl-tree";
import type { RpcOptions } from "@protobuf-ts/runtime-rpc";
import type { MiLogger } from "@milaboratories/ts-helpers";
import { scheduler } from "node:timers/promises";
import type { StreamingAPI_Response } from "../proto-grpc/github.com/milaboratory/pl/controllers/shared/grpc/streamingapi/protocol";
import { newLogHandle } from "./helpers/logs_handle";
import type { LogsStreamClient } from "./logs_stream";
import { LogsStreamDriver } from "./logs_stream";

const stream: ResourceInfo = {
  id: asSignedResourceId("1|c2lnbmF0dXJl"),
  type: { name: "StreamWorkdir", version: "1" },
};

/** A client whose calls hang until their abort signal fires, as on a dead link. */
function hangingClient() {
  const signals: AbortSignal[] = [];
  const hang = (options?: RpcOptions): Promise<StreamingAPI_Response> => {
    const signal = options?.abort;
    if (signal === undefined) throw new Error("call without an abort signal");
    signals.push(signal);
    signal.throwIfAborted();
    return new Promise((_, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
    );
  };
  const client: LogsStreamClient = {
    lastLines: async (_res, _lineCount, _offset, _search, options) => hang(options),
    readText: async (_res, _lineCount, _offset, _search, options) => hang(options),
  };
  return { client, signals };
}

function testLogger() {
  const logger: MiLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return logger;
}

test("dispose cancels running log requests and stops polling", async () => {
  const { client, signals } = hangingClient();
  const logger = testLogger();
  const consoleError = vi.spyOn(console, "error");
  onTestFinished(() => consoleError.mockRestore());
  const driver = new LogsStreamDriver(logger, client, {
    nConcurrentGetLogs: 10,
    pollingInterval: 10,
    stopPollingDelay: 10_000,
  });

  const c = Computable.make((ctx) => driver.getLastLogs(stream, 10, ctx));
  await c.getValue();
  await vi.waitFor(() => expect(signals).toHaveLength(1));
  const pendingRefresh = c.refreshState();

  const handle = newLogHandle(true, stream);
  const uiCall = driver.lastLines(handle, 10);
  await vi.waitFor(() => expect(signals).toHaveLength(2));

  await driver[Symbol.asyncDispose]();

  expect(signals.every((s) => s.aborted)).toBe(true);
  await expect(uiCall).rejects.toThrow();
  await pendingRefresh;

  await c.getValue();
  await scheduler.wait(50);
  expect(signals).toHaveLength(2);
  expect(logger.error).not.toHaveBeenCalled();
  expect(consoleError).not.toHaveBeenCalled();
  await expect(driver.lastLines(handle, 10)).rejects.toThrow();
});
