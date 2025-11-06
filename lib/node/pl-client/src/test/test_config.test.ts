import { getTestClientConf } from './test_config';
import { test, expect } from 'vitest';

test('test that test config have no alternative root set', async () => {
  const { conf } = await getTestClientConf();
  expect(conf.alternativeRoot).toBeUndefined();
});
