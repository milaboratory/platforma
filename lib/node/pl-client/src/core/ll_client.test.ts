import { LLPlClient } from './ll_client';
import { getTestConfig, getTestLLClient, getTestClientConf } from '../test/test_config';
import { TxAPI_Open_Request_WritableTx } from '../proto/github.com/milaboratory/pl/plapi/plapiproto/api';
import { request } from 'undici';
import * as tp from 'node:timers/promises';

import { UnauthenticatedError } from './errors';

test('authenticated instance test', async () => {
  const client = await getTestLLClient();
  const tx = client.createTx(true);
  const response = await tx.send(
    {
      oneofKind: 'txOpen',
      txOpen: { name: 'test', writable: TxAPI_Open_Request_WritableTx.WRITABLE }
    },
    false
  );
  expect(response.txOpen.tx?.isValid).toBeTruthy();
  await tx.complete();
  await tx.await();
});

test('unauthenticated status change', async () => {
  const cfg = getTestConfig();
  if (cfg.test_password === undefined) {
    console.log("skipping test because target server doesn't support authentication");
    return;
  }

  const client = new LLPlClient(cfg.address);
  expect(client.status).toBe('OK');

  const tx = client.createTx(true);

  await expect(async () => {
    await tx.send(
      {
        oneofKind: 'txOpen',
        txOpen: { name: 'test', writable: TxAPI_Open_Request_WritableTx.WRITABLE }
      },
      false
    );
  }).rejects.toThrow(UnauthenticatedError);

  await expect(async () => {
    await tx.await();
  }).rejects.toThrow(UnauthenticatedError);

  await tp.setImmediate();

  expect(client.status).toEqual('Unauthenticated');
});

test('automatic token update', async () => {
  const { conf, auth } = await getTestClientConf();
  conf.authMaxRefreshSeconds = 1;
  let numberOfAuthUpdates = 0;
  const client = new LLPlClient(conf, {
    auth: {
      authInformation: auth.authInformation,
      onUpdate: (auth) => {
        console.log(auth);
        ++numberOfAuthUpdates;
      }
    }
  });

  for (let i = 0; i < 6; i++) {
    const tx = client.createTx(true);
    const response = await tx.send(
      {
        oneofKind: 'txOpen',
        txOpen: { name: 'test', writable: TxAPI_Open_Request_WritableTx.WRITABLE }
      },
      false
    );
    expect(response.txOpen.tx?.isValid).toBeTruthy();
    await tx.complete();
    await tx.await();

    if (numberOfAuthUpdates > 1) {
      return;
    }

    await tp.setTimeout(1000);
  }
}, 5000);

test('test simple https call', async () => {
  const client = await getTestLLClient();
  const response = await request('https://cdn.milaboratory.com/ping', {
    dispatcher: client.httpDispatcher
  });
  const text = await response.body.text();
  expect(text).toEqual('pong');
});

test('test https call via proxy', async () => {
  const testConfig = getTestConfig();
  if (testConfig.test_proxy === undefined) {
    console.log('skipped');
    return;
  }
  const client = await getTestLLClient({ httpProxy: testConfig.test_proxy });
  const response = await request('https://cdn.milaboratory.com/ping', {
    dispatcher: client.httpDispatcher
  });
  const text = await response.body.text();
  expect(text).toEqual('pong');
});
