import { describe, it, expect } from "vitest";
import { UploadTask } from "./upload_task";
import type { ImportResourceSnapshot } from "./types";
import type { ClientProgress } from "../clients/progress";
import type { ClientUpload } from "../clients/upload";
import { ConsoleLoggerAdapter, HmacSha256Signer } from "@milaboratories/ts-helpers";
import type { ResourceId, ResourceType } from "@milaboratories/pl-client";

function makeNotFoundError() {
  const err: any = new Error("NOT_FOUND: resource not found");
  err.name = "RpcError";
  err.code = "NOT_FOUND";
  return err;
}

function makeMockResourceSnapshot(): ImportResourceSnapshot {
  return {
    id: 123456n as unknown as ResourceId,
    type: { name: "BlobIndex", version: "1" } as ResourceType,
    fields: { incarnation: undefined },
  } as unknown as ImportResourceSnapshot;
}

function createUploadTask(getStatusFn: (...args: any[]) => Promise<any>) {
  const logger = new ConsoleLoggerAdapter();
  const signer = new HmacSha256Signer(HmacSha256Signer.generateSecret());

  const mockClientUpload = {} as ClientUpload;
  const mockClientProgress = {
    getStatus: getStatusFn,
  } as unknown as ClientProgress;

  return new UploadTask(
    logger,
    mockClientUpload,
    mockClientProgress,
    10,
    signer,
    makeMockResourceSnapshot(),
  );
}

describe("UploadTask NOT_FOUND handling", () => {
  it("sets aborted when resource returns NOT_FOUND after partial progress", async () => {
    let callCount = 0;
    const task = createUploadTask(async () => {
      callCount++;
      if (callCount === 1) {
        return { done: false, progress: 0.5, bytesProcessed: "50", bytesTotal: "100" };
      }
      throw makeNotFoundError();
    });

    // First poll: partial progress
    await task.updateStatus();
    expect(task.progress.done).toBe(false);
    expect(task.progress.aborted).toBeFalsy();
    expect(task.progress.status?.progress).toBe(0.5);

    // Second poll: NOT_FOUND
    await task.updateStatus();
    expect(task.progress.done).toBe(true);
    expect(task.progress.aborted).toBe(true);
    expect(task.progress.lastError).toContain("NOT_FOUND");
  });

  it("sets aborted when first poll returns NOT_FOUND", async () => {
    const task = createUploadTask(async () => {
      throw makeNotFoundError();
    });

    await task.updateStatus();
    expect(task.progress.done).toBe(true);
    expect(task.progress.aborted).toBe(true);
    expect(task.progress.status).toBeUndefined();
    expect(task.progress.lastError).toContain("NOT_FOUND");
  });

  it("does not set aborted on normal completion", async () => {
    const task = createUploadTask(async () => {
      return { done: true, progress: 1.0, bytesProcessed: "100", bytesTotal: "100" };
    });

    await task.updateStatus();
    expect(task.progress.done).toBe(true);
    expect(task.progress.aborted).toBeFalsy();
    expect(task.progress.status?.progress).toBe(1.0);
  });
});
