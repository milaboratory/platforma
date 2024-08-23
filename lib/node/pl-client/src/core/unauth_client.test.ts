import { UnauthenticatedPlClient } from './unauth_client';
import { getTestConfig } from '../test/test_config';
import { UnauthenticatedError } from './errors';

test('ping test', async () => {
  const client = new UnauthenticatedPlClient(getTestConfig().address);
  const response = await client.ping();
  expect(response).toHaveProperty('coreVersion');
});

test('wrong login', async () => {
  const testConfig = getTestConfig();
  if (testConfig.test_user === undefined || testConfig.test_password === undefined) {
    console.log('skipped');
    return;
  }
  const client = new UnauthenticatedPlClient(testConfig.address);
  await expect(client.login(testConfig.test_user, testConfig.test_password + 'A')).rejects.toThrow(
    UnauthenticatedError
  );
});
