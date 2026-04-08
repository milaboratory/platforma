import { getTestLLClient } from "../test/test_config";
import { TxAPI_Open_Request_WritableTx } from "../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api";
import { createLocalResourceId } from "./types";
import { test, expect } from "vitest";

import { isTimeoutOrCancelError } from "./errors";
import { Aborted } from "@milaboratories/ts-helpers";
import type { LLPlClient } from "./ll_client";

/** Get root resource signature from ListUserResources for use as color proof in tests. */
async function getRootSignature(client: LLPlClient): Promise<Uint8Array> {
  const responses = await client.listUserResources({ limit: 1 });
  for (const msg of responses) {
    if (msg.entry.oneofKind === "userRoot" && msg.entry.userRoot.resourceSignature) {
      return msg.entry.userRoot.resourceSignature;
    }
  }
  return new Uint8Array(0);
}

test("check successful transaction", async () => {
  const client = await getTestLLClient();
  const tx = client.createTx(true);

  const openResp = await tx.send(
    {
      oneofKind: "txOpen",
      txOpen: {
        name: "test",
        writable: TxAPI_Open_Request_WritableTx.WRITABLE,
        enableFormattedErrors: false,
      },
    },
    false,
  );
  const commitResp = await tx.send(
    {
      oneofKind: "txCommit",
      txCommit: {},
    },
    false,
  );

  expect(openResp.txOpen.tx?.isValid).toBeTruthy();
  expect(commitResp.txCommit.success).toBeTruthy();
  await tx.await();
});

test("transaction timeout test", async () => {
  const client = await getTestLLClient();
  const tx = client.createTx(true, { timeout: 500 });

  await expect(async () => {
    const response = await tx.send(
      {
        oneofKind: "txOpen",
        txOpen: {
          name: "test",
          writable: TxAPI_Open_Request_WritableTx.WRITABLE,
          enableFormattedErrors: false,
        },
      },
      false,
    );
    expect(response.txOpen.tx?.isValid).toBeTruthy();
    await tx.await();
  }).rejects.toThrow(Aborted);
});

test("check timeout error type (passive)", async () => {
  const client = await getTestLLClient();
  const tx = client.createTx(true, { timeout: 500 });

  try {
    const response = await tx.send(
      {
        oneofKind: "txOpen",
        txOpen: {
          name: "test",
          writable: TxAPI_Open_Request_WritableTx.WRITABLE,
          enableFormattedErrors: false,
        },
      },
      false,
    );
    expect(response.txOpen.tx?.isValid).toBeTruthy();
    await tx.await();
  } catch (err: unknown) {
    expect(isTimeoutOrCancelError(err)).toBe(true);
  }
});

test("check timeout error type (active)", async () => {
  const client = await getTestLLClient();
  const rootSig = await getRootSignature(client);
  const tx = client.createTx(true, { timeout: 500 });

  try {
    const openResponse = await tx.send(
      {
        oneofKind: "txOpen",
        txOpen: {
          name: "test",
          writable: TxAPI_Open_Request_WritableTx.WRITABLE,
          enableFormattedErrors: false,
        },
      },
      false,
    );
    expect(openResponse.txOpen.tx?.isValid).toBeTruthy();

    // Set default color so resource creation succeeds in strict mode
    await tx.send(
      { oneofKind: "setDefaultColor", setDefaultColor: { colorProof: rootSig } },
      false,
    );

    const rData = Uint8Array.from([
      (Math.random() * 256) & 0xff,
      (Math.random() * 256) & 0xff,
      (Math.random() * 256) & 0xff,
      (Math.random() * 256) & 0xff,
      (Math.random() * 256) & 0xff,
      (Math.random() * 256) & 0xff,
      (Math.random() * 256) & 0xff,
      (Math.random() * 256) & 0xff,
    ]);

    const createResponse = await tx.send(
      {
        oneofKind: "resourceCreateValue",
        resourceCreateValue: {
          id: createLocalResourceId(false, 1, 1),
          type: { name: "TestValue", version: "1" },
          data: rData,
          errorIfExists: false,
        },
      },
      false,
    );
    const createResp = (await createResponse).resourceCreateValue;
    const id = createResp.resourceId;
    const resourceSignature = createResp.resourceSignature ?? new Uint8Array(0);

    while (true) {
      const vr = await tx.send(
        {
          oneofKind: "resourceGet",
          resourceGet: {
            resourceId: id,
            loadFields: false,
            resourceSignature,
          },
        },
        false,
      );

      expect(Buffer.compare(vr.resourceGet.resource!.data, rData)).toBe(0);
    }
  } catch (err: unknown) {
    expect(isTimeoutOrCancelError(err)).toBe(true);
  }
});

test("check is abort error (active)", async () => {
  const client = await getTestLLClient();
  const rootSig = await getRootSignature(client);
  const tx = client.createTx(true, { abortSignal: AbortSignal.timeout(100) });

  try {
    const openResponse = await tx.send(
      {
        oneofKind: "txOpen",
        txOpen: {
          name: "test",
          writable: TxAPI_Open_Request_WritableTx.WRITABLE,
          enableFormattedErrors: false,
        },
      },
      false,
    );
    expect(openResponse.txOpen.tx?.isValid).toBeTruthy();

    // Set default color so resource creation succeeds in strict mode
    await tx.send(
      { oneofKind: "setDefaultColor", setDefaultColor: { colorProof: rootSig } },
      false,
    );

    const rData = Uint8Array.from([
      Math.random() & 0xff,
      Math.random() & 0xff,
      Math.random() & 0xff,
      Math.random() & 0xff,
      Math.random() & 0xff,
      Math.random() & 0xff,
      Math.random() & 0xff,
      Math.random() & 0xff,
    ]);

    const createResponse = await tx.send(
      {
        oneofKind: "resourceCreateValue",
        resourceCreateValue: {
          id: createLocalResourceId(false, 1, 1),
          type: { name: "TestValue", version: "1" },
          data: rData,
          errorIfExists: false,
        },
      },
      false,
    );
    const createResp = (await createResponse).resourceCreateValue;
    const id = createResp.resourceId;
    const resourceSignature = createResp.resourceSignature ?? new Uint8Array(0);

    while (true) {
      const vr = await tx.send(
        {
          oneofKind: "resourceGet",
          resourceGet: {
            resourceId: id,
            loadFields: false,
            resourceSignature,
          },
        },
        false,
      );

      expect(Buffer.compare(vr.resourceGet.resource!.data, rData)).toBe(0);
    }
  } catch (err: unknown) {
    expect(isTimeoutOrCancelError(err)).toBe(true);
  }
});
