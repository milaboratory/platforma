import { LLPlClient } from './ll_client';
import { getTestConfig, getTestLLClient, getTestClientConf } from './test_config';
import { TxAPI_Open_Request_WritableTx } from './proto/github.com/milaboratory/pl/plapi/plapiproto/api';
import { UnauthenticatedPlClient } from './unauth_client';


test('ping test', async () => {
  const client = new UnauthenticatedPlClient(getTestConfig().address);
  const response = await client.ping();
  expect(response).toHaveProperty('coreVersion');
});

test('authenticated instance test', async () => {
  const client = await getTestLLClient();
  const tx = client.createTx();
  const response = await tx.send({
    oneofKind: 'txOpen',
    txOpen: { name: 'test', writable: TxAPI_Open_Request_WritableTx.WRITABLE }
  }, false);
  expect(response.txOpen.tx?.isValid).toBeTruthy();
  await tx.complete();
  await tx.await();
});

test('unauthenticated status change', async () => {
  const cfg = getTestConfig();
  if (cfg.test_password === undefined) {
    console.log('skipping test because target server doesn\'t support authentication');
    return;
  }

  const client = new LLPlClient(cfg.address);
  expect(client.status).toBe('OK');

  const tx = client.createTx();

  await expect(async () => {
    await tx.send({
      oneofKind: 'txOpen',
      txOpen: { name: 'test', writable: TxAPI_Open_Request_WritableTx.WRITABLE }
    }, false);
  })
    .rejects
    .toThrow(/authenticate/);

  await expect(async () => {
    await tx.await();
  })
    .rejects
    .toThrow(/authenticate/);

  expect(client.status).toEqual('Unauthenticated');
});

test('automatic token update', async () => {
  const { conf, authInformation } = await getTestClientConf();
  conf.authMaxRefreshSeconds = 1;
  let numberOfAuthUpdates = 0;
  const client = new LLPlClient(conf, {
    auth: {
      authInformation,
      onUpdate: (auth) => {
        console.log(auth);
        ++numberOfAuthUpdates;
      }
    }
  });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let i = 0; i < 6; i++) {
    const tx = client.createTx();
    const response = await tx.send({
      oneofKind: 'txOpen',
      txOpen: { name: 'test', writable: TxAPI_Open_Request_WritableTx.WRITABLE }
    }, false);
    expect(response.txOpen.tx?.isValid).toBeTruthy();
    await tx.complete();
    await tx.await();

    if (numberOfAuthUpdates > 1) {
      return;
    }

    await sleep(1000);
  }
}, 5000);
