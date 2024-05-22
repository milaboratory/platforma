import { isNotNullResourceId, TestHelpers } from '@milaboratory/pl-client-v2';

test('simple test', async () => {
  await TestHelpers.withTempRoot(async client => {
    expect(isNotNullResourceId(client.clientRoot)).toBe(true);
  });
});
