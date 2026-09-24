import { asSignedResourceId, resourceType } from "@milaboratories/pl-client";
import { ConsoleLoggerAdapter, HmacSha256Signer } from "@milaboratories/ts-helpers";
import { RpcError } from "@protobuf-ts/runtime-rpc";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ProgressStatus } from "../clients/progress";
import type { UploadResourceSnapshot } from "./types";
import { UploadTask } from "./upload_task";

type UploadTaskBlobClient = ConstructorParameters<typeof UploadTask>[1];
type UploadTaskProgressClient = ConstructorParameters<typeof UploadTask>[2];
type StatusReply = ProgressStatus | RpcError;

function makeProgressClient(replies: StatusReply[]): UploadTaskProgressClient {
  return {
    getStatus: async () => {
      const reply = replies.shift();
      if (reply === undefined) throw new Error("no more status replies");
      if (reply instanceof RpcError) throw reply;
      return reply;
    },
  };
}

const blobClient: UploadTaskBlobClient = {
  initUpload: async () => {
    throw new Error("initUpload is not expected");
  },
  partUpload: async () => {
    throw new Error("partUpload is not expected");
  },
  finalize: async () => {
    throw new Error("finalize is not expected");
  },
};

function makeTask(replies: StatusReply[]): UploadTask {
  const signer = new HmacSha256Signer(HmacSha256Signer.generateSecret());
  const localPath = "/tmp/upload_task_test.txt";
  const res: UploadResourceSnapshot = {
    id: asSignedResourceId("1234|abcd"),
    type: resourceType("BlobUpload/main", "1"),
    data: {
      localPath,
      pathSignature: signer.sign(localPath),
      sizeBytes: "2",
      modificationTime: "0",
    },
    fields: { blob: undefined },
    kv: undefined,
  };

  return new UploadTask(
    new ConsoleLoggerAdapter(),
    blobClient,
    makeProgressClient(replies),
    1,
    signer,
    res,
  );
}

const notFound = () => new RpcError("no progress info for resource", "NOT_FOUND");
const aborted = () => new RpcError("progress failed", "ABORTED");

const halfStatus: ProgressStatus = {
  done: false,
  progress: 0.5,
  bytesProcessed: "1",
  bytesTotal: "2",
};

const doneStatus: ProgressStatus = {
  done: true,
  progress: 1,
  bytesProcessed: "2",
  bytesTotal: "2",
};

describe("UploadTask.updateStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("NOT_FOUND before the first status keeps the task pending", async () => {
    const task = makeTask([notFound(), doneStatus]);

    await task.updateStatus();

    expect(task.progress.done).toBe(false);
    expect(task.progress.status).toBeUndefined();
    expect(task.progress.lastError).toBeUndefined();

    await task.updateStatus();

    expect(task.progress.done).toBe(true);
    expect(task.progress.lastError).toBeUndefined();
    expect(task.progress.status).toStrictEqual({
      progress: 1,
      bytesProcessed: 2,
      bytesTotal: 2,
    });
  });

  test("NOT_FOUND before the first status is terminal after the timeout", async () => {
    const task = makeTask([notFound(), notFound(), notFound()]);

    await task.updateStatus();
    vi.advanceTimersByTime(4 * 60 * 1000);
    await task.updateStatus();

    expect(task.progress.done).toBe(false);
    expect(task.progress.lastError).toBeUndefined();

    vi.advanceTimersByTime(60 * 1000);
    await task.updateStatus();

    expect(task.progress.done).toBe(true);
    expect(task.progress.status).toBeUndefined();
    expect(task.progress.lastError).toContain("NOT_FOUND");
  });

  test("ABORTED before the first status marks the task done", async () => {
    const task = makeTask([aborted()]);

    await task.updateStatus();

    expect(task.progress.done).toBe(true);
    expect(task.progress.status).toBeUndefined();
    expect(task.progress.lastError).toBeUndefined();
  });

  test("NOT_FOUND after a status marks the task done and keeps the status", async () => {
    const task = makeTask([halfStatus, notFound()]);

    await task.updateStatus();
    expect(task.progress.done).toBe(false);

    await task.updateStatus();
    expect(task.progress.done).toBe(true);
    expect(task.progress.lastError).toBeUndefined();
    expect(task.progress.status).toStrictEqual({
      progress: 0.5,
      bytesProcessed: 1,
      bytesTotal: 2,
    });
  });
});
