import { getTestClient, getTestClientConf } from './test_config';
import { PlClient } from './client';

test('test client init', async () => {
  const client = await getTestClient(false);
  await client.init();
});

test('test client alternative root init', async () => {
  const aRootName = 'test_root';
  const { conf, authInformation } = await getTestClientConf();
  const clientA = new PlClient({ ...conf, alternativeRoot: aRootName }, { authInformation });
  await clientA.init();
  const clientB = new PlClient(conf, { authInformation });
  await clientB.init();
  const result = await clientB.deleteAlternativeRoot(aRootName);
  expect(result).toBe(true);
});

test('test client init', async () => {
  const client = await getTestClient();
});
