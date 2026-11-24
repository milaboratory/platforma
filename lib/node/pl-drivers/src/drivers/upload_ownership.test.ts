import {
  createSignedResourceId,
  NullSignedResourceId,
  type SignedResourceId,
} from "@milaboratories/pl-client";
import { ConsoleLoggerAdapter, HmacSha256Signer } from "@milaboratories/ts-helpers";
import { setTimeout } from "node:timers/promises";
import { describe, expect, test } from "vitest";
import { NoFileForUploading } from "../clients/upload";
import { UploadAPI_ChecksumAlgorithm } from "../proto-grpc/github.com/milaboratory/pl/controllers/shared/grpc/uploadapi/protocol";
import type { UploadResourceSnapshot } from "./types";
import { UploadDriver, uploadSnapshotFromResourceData } from "./upload";
import type { BlobProgressClient, BlobUploadClient } from "./upload_task";

describe("upload ownership", () => {
  test("an owned upload finishes with nobody reading its progress", async () => {
    const t = setup();
    const res = t.upload();

    expect(t.driver.adopt(res, "project-1")).toBe("adopted");
    await t.client.finalized(res.id);
    expect(t.client.partsOf(res.id)).toEqual([1n, 2n, 3n]);
  });

  test("an owned upload keeps going after its last reader leaves", async () => {
    const t = setup({ gated: true });
    const res = t.upload();

    const progress = t.driver.getProgressId(res);
    await progress.getValue();
    expect(t.driver.adopt(res, "project-1")).toBe("adopted");
    await t.client.partStarted(res.id);
    progress.resetState();

    t.client.open();
    await t.client.finalized(res.id);
    expect(t.client.partsOf(res.id)).toEqual([1n, 2n, 3n]);
  });

  test("adopting the same resource twice queues one upload", async () => {
    const t = setup();
    const res = t.upload();

    expect(t.driver.adopt(res, "project-1")).toBe("adopted");
    expect(t.driver.adopt(res, "project-1")).toBe("alreadyOwned");
    expect(t.driver.adopt(res, "project-2")).toBe("adopted");
    await t.client.finalized(res.id);
    await setTimeout(20);
    expect(t.client.initCalls(res.id)).toBe(1);
  });

  test("an upload signed elsewhere is not adopted", async () => {
    const t = setup();
    const res = t.upload({ signer: new HmacSha256Signer(HmacSha256Signer.generateSecret()) });

    expect(t.driver.adopt(res, "project-1")).toBe("notMine");
    await setTimeout(20);
    expect(t.client.initCalls(res.id)).toBe(0);
  });

  test("an upload whose blob is already set is adopted without a task and makes no client call", async () => {
    const t = setup();
    const res = t.upload({ blob: createSignedResourceId(999n) });

    expect(t.driver.adopt(res, "project-1")).toBe("alreadyUploaded");
    await setTimeout(20);
    expect(t.client.initCalls(res.id)).toBe(0);
  });

  test("releasing the owner stops an unobserved upload at the next part", async () => {
    const t = setup({ gated: true });
    const res = t.upload();

    t.driver.adopt(res, "project-1");
    await t.client.partStarted(res.id);
    expect(t.driver.releaseOwner("project-1")).toBe(1);

    t.client.open();
    await setTimeout(50);
    expect(t.client.isFinalized(res.id)).toBe(false);
    expect(t.client.partsOf(res.id).length).toBeLessThan(3);
  });

  test("a terminated driver stops an owned upload", async () => {
    const t = setup({ gated: true });
    const res = t.upload();

    t.driver.adopt(res, "project-1");
    await t.client.partStarted(res.id);
    await t.driver.terminate();

    t.client.open();
    await setTimeout(50);
    expect(t.client.isFinalized(res.id)).toBe(false);
    expect(t.client.partsOf(res.id).length).toBeLessThan(3);
  });

  test("a failed owned upload is not restarted by re-adoption", async () => {
    const t = setup({ failParts: true });
    const res = t.upload();

    expect(t.driver.adopt(res, "project-1")).toBe("adopted");
    await waitFor(() => t.client.failures(res.id) > 0);
    await setTimeout(20);

    expect(t.driver.adopt(res, "project-1")).toBe("failed");
    expect(t.driver.adopt(res, "project-2")).toBe("failed");
    await setTimeout(50);
    expect(t.client.initCalls(res.id)).toBe(1);
  });

  test("two adopted uploads run at once", async () => {
    const t = setup({ gated: true });
    const first = t.upload();
    const second = t.upload();

    t.driver.adopt(first, "project-1");
    t.driver.adopt(second, "project-1");
    await Promise.all([t.client.partStarted(first.id), t.client.partStarted(second.id)]);

    t.client.open();
    await Promise.all([t.client.finalized(first.id), t.client.finalized(second.id)]);
  });
});

describe("uploadSnapshotFromResourceData", () => {
  test("a BlobUpload body from a tree mirror reads as the snapshot adopt takes", () => {
    const t = setup();
    const res = t.upload();
    const body = {
      id: res.id,
      kind: "Structural" as const,
      type: res.type,
      data: Buffer.from(JSON.stringify(res.data)),
      originalResourceId: NullSignedResourceId,
      canonicalId: new Uint8Array(0),
      error: NullSignedResourceId,
      inputsLocked: true,
      outputsLocked: false,
      resourceReady: false,
      final: false,
      kv: [],
      fields: [
        {
          name: "blob",
          type: "Service" as const,
          value: NullSignedResourceId,
          error: NullSignedResourceId,
          status: "Empty" as const,
          valueIsFinal: false,
        },
      ],
    };

    expect(uploadSnapshotFromResourceData(body)).toEqual(res);

    const blob = createSignedResourceId(4242n);
    const uploaded = uploadSnapshotFromResourceData({
      ...body,
      fields: [{ ...body.fields[0], value: blob, status: "Resolved" as const }],
    });
    expect(uploaded.fields.blob).toBe(blob);
    expect(t.driver.adopt(uploaded, "project-1")).toBe("alreadyUploaded");
  });
});

describe("upload progress", () => {
  test("progress returned to a reader does not change when the upload moves on", async () => {
    const t = setup();
    const res = t.upload();
    const progress = t.driver.getProgressId(res);

    const before = await progress.getValue();
    expect(before.done).toBe(false);

    await progress.awaitChange(AbortSignal.timeout(5000));
    const after = await progress.getValue();
    expect(after.done).toBe(true);
    expect(before.done).toBe(false);
    expect(before.status).toBeUndefined();

    progress.resetState();
  });
});

// Internals

let nextResourceId = 1000n;

type Setup = {
  readonly driver: UploadDriver;
  readonly client: FakeUploadClient;
  upload(ops?: {
    readonly signer?: HmacSha256Signer;
    readonly blob?: SignedResourceId;
  }): UploadResourceSnapshot;
};

function setup(ops: { readonly gated?: boolean; readonly failParts?: boolean } = {}): Setup {
  const signer = new HmacSha256Signer(HmacSha256Signer.generateSecret());
  const client = new FakeUploadClient({
    gated: ops.gated ?? false,
    failParts: ops.failParts ?? false,
  });
  const progressClient: BlobProgressClient = {
    getStatus: () =>
      Promise.resolve({ done: true, progress: 1, bytesProcessed: "3", bytesTotal: "3" }),
  };
  const driver = new UploadDriver(new ConsoleLoggerAdapter(), signer, client, progressClient, {
    nConcurrentPartUploads: 1,
    nConcurrentGetProgresses: 1,
    nConcurrentUploads: 2,
    pollingInterval: 10,
    stopPollingDelay: 10,
  });

  return {
    driver,
    client,
    upload: ({ signer: by = signer, blob } = {}) => {
      const localPath = `/tmp/file-${nextResourceId}`;
      return {
        id: createSignedResourceId(nextResourceId++),
        type: { name: "BlobUpload/main", version: "1" },
        data: {
          localPath,
          pathSignature: by.sign(localPath),
          sizeBytes: "3",
          modificationTime: "0",
        },
        fields: { blob },
        kv: undefined,
      };
    },
  };
}

/** Uploads three parts per resource and records what it was asked to do. While gated, every
 * part waits until {@link open}. */
class FakeUploadClient implements BlobUploadClient {
  private readonly calls = new Map<
    SignedResourceId,
    { init: number; started: number; parts: bigint[]; failures: number; finalized: boolean }
  >();
  private gate: Promise<void>;
  private openGate: () => void = () => {};

  constructor(private readonly ops: { readonly gated: boolean; readonly failParts: boolean }) {
    this.gate = ops.gated
      ? new Promise((resolve) => {
          this.openGate = resolve;
        })
      : Promise.resolve();
  }

  open(): void {
    this.openGate();
  }

  initUpload: BlobUploadClient["initUpload"] = ({ id }) => {
    this.of(id).init++;
    return Promise.resolve({
      overall: 3n,
      toUpload: [1n, 2n, 3n],
      checksumAlgorithm: UploadAPI_ChecksumAlgorithm.UNSPECIFIED,
      checksumHeader: "",
    });
  };

  partUpload: BlobUploadClient["partUpload"] = async ({ id }, _path, _mtime, part) => {
    const calls = this.of(id);
    calls.started++;
    await this.gate;
    if (this.ops.failParts) {
      calls.failures++;
      throw new NoFileForUploading("file is gone");
    }
    calls.parts.push(part);
  };

  finalize: BlobUploadClient["finalize"] = ({ id }) => {
    this.of(id).finalized = true;
    return Promise.resolve();
  };

  initCalls(id: SignedResourceId): number {
    return this.calls.get(id)?.init ?? 0;
  }

  partsOf(id: SignedResourceId): bigint[] {
    return this.calls.get(id)?.parts ?? [];
  }

  failures(id: SignedResourceId): number {
    return this.calls.get(id)?.failures ?? 0;
  }

  isFinalized(id: SignedResourceId): boolean {
    return this.calls.get(id)?.finalized ?? false;
  }

  async partStarted(id: SignedResourceId): Promise<void> {
    await waitFor(() => (this.calls.get(id)?.started ?? 0) > 0);
  }

  async finalized(id: SignedResourceId): Promise<void> {
    await waitFor(() => this.isFinalized(id));
  }

  private of(id: SignedResourceId) {
    let calls = this.calls.get(id);
    if (calls === undefined) {
      calls = { init: 0, started: 0, parts: [], failures: 0, finalized: false };
      this.calls.set(id, calls);
    }
    return calls;
  }
}

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in 5 s");
    await setTimeout(2);
  }
}
