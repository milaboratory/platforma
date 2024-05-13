import { getTestClient } from './test_config';

test('test client init', async () => {
  const client = await getTestClient(false);
  await client.init();
});
