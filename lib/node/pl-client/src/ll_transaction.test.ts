import { getTestLLClient } from './test_config';
import { TxAPI_Open_Request_WritableTx } from './proto/github.com/milaboratory/pl/plapi/plapiproto/api';

test('transaction timeout test', async () => {
  const client = await getTestLLClient();
  const tx = client.createTx({ timeout: 500 });

  await expect(async () => {
    const response = await tx.send({
      oneofKind: 'txOpen',
      txOpen: { name: 'test', writable: TxAPI_Open_Request_WritableTx.WRITABLE }
    });
    expect(response.txOpen.tx?.isValid).toBeTruthy();
    await tx.await();
  })
    .rejects
    .toThrow(/Deadline/);
});
