import { getTestLLClient } from '../test/test_config';
import { TxAPI_Open_Request_WritableTx } from '../proto/github.com/milaboratory/pl/plapi/plapiproto/api';
import { createLocalResourceId } from './types';

import { isTimeoutOrCancelError } from './errors';
import { Aborted } from '@milaboratory/ts-helpers';

test('transaction timeout test', async () => {
  const client = await getTestLLClient();
  const tx = client.createTx({ timeout: 500 });

  await expect(async () => {
    const response = await tx.send({
      oneofKind: 'txOpen',
      txOpen: { name: 'test', writable: TxAPI_Open_Request_WritableTx.WRITABLE }
    }, false);
    expect(response.txOpen.tx?.isValid).toBeTruthy();
    await tx.await();
  })
    .rejects
    .toThrow(Aborted);
});

test('check timeout error type (passive)', async () => {
  const client = await getTestLLClient();
  const tx = client.createTx({ timeout: 500 });

  try {
    const response = await tx.send({
      oneofKind: 'txOpen',
      txOpen: { name: 'test', writable: TxAPI_Open_Request_WritableTx.WRITABLE }
    }, false);
    expect(response.txOpen.tx?.isValid).toBeTruthy();
    await tx.await();
  } catch (err: unknown) {
    expect(isTimeoutOrCancelError(err)).toBe(true);
  }
});

test('check timeout error type (active)', async () => {
  const client = await getTestLLClient();
  const tx = client.createTx({ timeout: 500 });

  try {
    const openResponse = await tx.send({
      oneofKind: 'txOpen',
      txOpen: { name: 'test', writable: TxAPI_Open_Request_WritableTx.WRITABLE }
    }, false);
    expect(openResponse.txOpen.tx?.isValid).toBeTruthy();

    const rData = Uint8Array.from([
      (Math.random() * 256) & 0xFF, (Math.random() * 256) & 0xFF, (Math.random() * 256) & 0xFF, (Math.random() * 256) & 0xFF,
      (Math.random() * 256) & 0xFF, (Math.random() * 256) & 0xFF, (Math.random() * 256) & 0xFF, (Math.random() * 256) & 0xFF
    ]);

    const createResponse = await tx.send({
      oneofKind: 'resourceCreateValue',
      resourceCreateValue: {
        id: createLocalResourceId(false, 1, 1),
        type: { name: 'TestValue', version: '1' }, data: rData, errorIfExists: false
      }
    }, false);
    const id = (await createResponse).resourceCreateValue.resourceId;

    while (true) {
      const vr = await tx.send({
        oneofKind: 'resourceGet',
        resourceGet: { resourceId: id, loadFields: false }
      }, false);

      expect(Buffer.compare(vr.resourceGet.resource!.data, rData)).toBe(0);
    }

  } catch (err: unknown) {
    expect(isTimeoutOrCancelError(err)).toBe(true);
  }
});

test('check is abort error (active)', async () => {
  const client = await getTestLLClient();
  const tx = client.createTx({ abortSignal: AbortSignal.timeout(100) });

  try {
    const openResponse = await tx.send({
      oneofKind: 'txOpen',
      txOpen: { name: 'test', writable: TxAPI_Open_Request_WritableTx.WRITABLE }
    }, false);
    expect(openResponse.txOpen.tx?.isValid).toBeTruthy();

    const rData = Uint8Array.from([
      Math.random() & 0xFF, Math.random() & 0xFF, Math.random() & 0xFF, Math.random() & 0xFF,
      Math.random() & 0xFF, Math.random() & 0xFF, Math.random() & 0xFF, Math.random() & 0xFF
    ]);

    const createResponse = await tx.send({
      oneofKind: 'resourceCreateValue',
      resourceCreateValue: {
        id: createLocalResourceId(false, 1, 1),
        type: { name: 'TestValue', version: '1' }, data: rData, errorIfExists: false
      }
    }, false);
    const id = (await createResponse).resourceCreateValue.resourceId;

    while (true) {
      const vr = await tx.send({
        oneofKind: 'resourceGet',
        resourceGet: { resourceId: id, loadFields: false }
      }, false);

      expect(Buffer.compare(vr.resourceGet.resource!.data, rData)).toBe(0);
    }

  } catch (err: unknown) {
    expect(isTimeoutOrCancelError(err)).toBe(true);
  }
});
