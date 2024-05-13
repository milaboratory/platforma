import { TxAPI_Open_Request_WritableTx } from '../proto/github.com/milaboratory/pl/plapi/plapiproto/api';
import { sleep } from './temporal';

test('timeout', async () => {
  await sleep(10);
});

test('abort timeout', async () => {
  await expect(async () => {
    await sleep(1000, AbortSignal.timeout(10));
  })
    .rejects
    .toThrow(/aborted/);
});

test('aborted timeout', async () => {
  await expect(async () => {
    await sleep(1000, AbortSignal.abort());
  })
    .rejects
    .toThrow(/aborted/);
});
